import "server-only";
import { desc, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db/client";
import { getStripe, StripeConfigError, stripeErrorLogFields } from "@/lib/stripe";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { requireOwnership } from "@/modules/auth/services/current-user.service";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { RESUME_WINDOW_SECONDS } from "@/modules/payments/services/payment-checkout.service";
import { PaymentError } from "@/modules/payments/services/payment-errors";
import { reconcileProjectPayment } from "@/modules/payments/services/payment-reconciliation.service";
import { applySessionOutcome } from "@/modules/payments/services/payment-session-effects";
import { cancelPendingAttemptWithoutSession } from "@/modules/payments/services/payment-transitions";
import type { CancelPaymentResult } from "@/modules/payments/types/payment.types";
import { projects } from "@/modules/projects/schema/projects.table";

type Outcome = CancelPaymentResult["outcome"];

/**
 * Explicit cancellation of a pending test payment (spec 012 RF5). Stripe decides: a session is only
 * canceled locally after Stripe reported it `expired` (by `expire`, or by an authenticated re-read
 * when `expire` failed). Never cancels "because expire failed". No Stripe call runs inside a
 * transaction that holds locks.
 */
export async function cancelPendingPayment(
  actor: AuthUser,
  projectId: string,
): Promise<CancelPaymentResult> {
  if (!can(actor.role, "payment.start")) throw new AuthError("FORBIDDEN");
  const stripe = resolveStripe();

  const [project] = await db
    .select({ id: projects.id, clientId: projects.clientId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new AuthError("NOT_FOUND");
  requireOwnership(actor, project.clientId); // no admin: admins do not cancel payments

  // At most one re-analysis, when another request changed the attempt under us (D-G).
  for (let round = 0; round < 2; round++) {
    const latest = await latestAttempt(projectId);
    if (!latest || latest.status === "failed" || latest.status === "canceled") {
      return { outcome: "none" };
    }
    if (latest.status === "completed_test") return { outcome: "completed" };

    if (latest.sessionId) return cancelWithSession(stripe, actor, projectId, latest.sessionId);

    const ageMs = Date.now() - latest.createdAt.getTime();
    if (ageMs <= RESUME_WINDOW_SECONDS * 1000) throw new PaymentError("PAYMENT_NOT_CANCELABLE");
    const canceled = await db.transaction((tx) => cancelPendingAttemptWithoutSession(tx, latest.id));
    if (canceled) return { outcome: "canceled" };
  }
  throw new PaymentError("PAYMENT_NOT_CANCELABLE");
}

async function latestAttempt(projectId: string) {
  const [latest] = await db
    .select({
      id: paymentAttempts.id,
      status: paymentAttempts.status,
      sessionId: paymentAttempts.stripeCheckoutSessionId,
      createdAt: paymentAttempts.createdAt,
    })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.projectId, projectId))
    .orderBy(desc(paymentAttempts.createdAt), desc(paymentAttempts.id))
    .limit(1);
  return latest;
}

async function cancelWithSession(
  stripe: Stripe,
  actor: AuthUser,
  projectId: string,
  sessionId: string,
): Promise<CancelPaymentResult> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.expire(sessionId);
  } catch (e) {
    console.error("[payments] Stripe expire failed:", stripeErrorLogFields(e));
    return fallbackToReconciliation(actor, projectId);
  }
  if (session.livemode !== false) throw new PaymentError("STRIPE_NOT_CONFIGURED");
  if (session.status !== "expired") throw new PaymentError("PAYMENT_NOT_CANCELABLE");

  const effect = await db.transaction((tx) => applySessionOutcome(tx, { outcome: "expired", session }));
  if (effect.result === "applied") return { outcome: "canceled" };
  if (effect.reason === "attempt_not_pending" && effect.attemptId) {
    return { outcome: await outcomeOfSettledAttempt(effect.attemptId) };
  }
  throw new PaymentError("PAYMENT_NOT_CANCELABLE");
}

/** `expire` failed: never cancel locally; re-read the session (authenticated) and apply what Stripe says. */
async function fallbackToReconciliation(actor: AuthUser, projectId: string): Promise<CancelPaymentResult> {
  const { outcome } = await reconcileProjectPayment(actor, projectId);
  if (outcome === "unchanged") throw new PaymentError("PAYMENT_NOT_CANCELABLE");
  return { outcome };
}

/** The webhook or a refresh got there first: report what the attempt ended up as. */
async function outcomeOfSettledAttempt(attemptId: string): Promise<Outcome> {
  const [row] = await db
    .select({ status: paymentAttempts.status })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
    .limit(1);
  if (row?.status === "canceled") return "canceled";
  if (row?.status === "completed_test") return "completed";
  return "none";
}

function resolveStripe(): Stripe {
  try {
    return getStripe();
  } catch (e) {
    if (e instanceof StripeConfigError) {
      console.error("[payments] Stripe configuration error:", e.message);
      throw new PaymentError("STRIPE_NOT_CONFIGURED");
    }
    throw e;
  }
}
