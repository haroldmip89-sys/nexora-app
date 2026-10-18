import "server-only";
import { desc, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db/client";
import { getStripe, StripeConfigError } from "@/lib/stripe";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { requireOwnership } from "@/modules/auth/services/current-user.service";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { PaymentError } from "@/modules/payments/services/payment-errors";
import {
  applySessionOutcome,
  type SessionOutcome,
} from "@/modules/payments/services/payment-session-effects";
import type { ReconcileResult } from "@/modules/payments/types/payment.types";
import { projects } from "@/modules/projects/schema/projects.table";

/**
 * On-demand reconciliation (spec 010 RF7): re-reads the pending attempt's Checkout Session from the
 * Stripe API (authenticated, server-side) and applies the same core as the webhook. The browser
 * contributes no state. Never produces `failed` (a read cannot tell an async failure from pending).
 */
export async function reconcileProjectPayment(
  actor: AuthUser,
  projectId: string,
): Promise<ReconcileResult> {
  if (!can(actor.role, "payment.start")) throw new AuthError("FORBIDDEN");
  const stripe = resolveStripe();

  const [project] = await db
    .select({ id: projects.id, clientId: projects.clientId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new AuthError("NOT_FOUND");
  requireOwnership(actor, project.clientId);

  const [latest] = await db
    .select({
      status: paymentAttempts.status,
      sessionId: paymentAttempts.stripeCheckoutSessionId,
    })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.projectId, projectId))
    .orderBy(desc(paymentAttempts.createdAt), desc(paymentAttempts.id))
    .limit(1);
  if (!latest || latest.status !== "pending" || !latest.sessionId) return { outcome: "none" };

  // Stripe is read outside any transaction.
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(latest.sessionId);
  } catch (e) {
    const err = (e ?? {}) as { type?: unknown; code?: unknown; statusCode?: unknown };
    console.error("[payments] Stripe retrieve failed:", {
      type: err.type,
      code: err.code,
      statusCode: err.statusCode,
    });
    throw new PaymentError("STRIPE_UNAVAILABLE");
  }
  if (session.livemode !== false) throw new PaymentError("STRIPE_NOT_CONFIGURED");

  const outcome = outcomeOf(session);
  if (!outcome) return { outcome: "unchanged" };

  const effect = await db.transaction((tx) => applySessionOutcome(tx, { outcome, session }));
  if (effect.result !== "applied") return { outcome: "unchanged" };
  return { outcome: effect.reason === "canceled" ? "canceled" : "completed" };
}

function outcomeOf(session: Stripe.Checkout.Session): SessionOutcome | null {
  if (session.status === "complete" && session.payment_status === "paid") return "completed";
  if (session.status === "expired") return "expired";
  return null;
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
