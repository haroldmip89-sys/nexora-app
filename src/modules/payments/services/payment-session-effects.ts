import "server-only";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { db } from "@/lib/db/client";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import {
  cancelPendingAttempt,
  completePendingAttempt,
  failPendingAttempt,
} from "@/modules/payments/services/payment-transitions";
import type { AppliedReason, IgnoredReason } from "@/modules/payments/types/payment.types";
import { projects } from "@/modules/projects/schema/projects.table";
import { markContracted } from "@/modules/projects/services/project-transitions";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SessionOutcome = "completed" | "failed" | "expired";

export type SessionEffectResult = (
  | { result: "applied"; reason: AppliedReason }
  | { result: "ignored"; reason: IgnoredReason }
) & { attemptId: string | null };

const attemptColumns = {
  id: paymentAttempts.id,
  projectId: paymentAttempts.projectId,
  proposalId: paymentAttempts.proposalId,
  clientId: paymentAttempts.clientId,
  status: paymentAttempts.status,
  amountCents: paymentAttempts.amountCents,
  currency: paymentAttempts.currency,
};

/**
 * Single implementation of the rules that turn a Checkout Session outcome into state changes
 * (spec 010 RF5). Runs inside the caller's transaction; lock order: project -> attempt.
 * No Stripe calls here. Logs only ids and reasons, never amounts, sessions or customer data.
 */
export async function applySessionOutcome(
  tx: Tx,
  input: { outcome: SessionOutcome; session: Stripe.Checkout.Session },
): Promise<SessionEffectResult> {
  const { outcome, session } = input;

  // 1. Locate by session id only (UNIQUE). Metadata never decides which attempt it is.
  if (typeof session.id !== "string" || session.id === "") return ignored("attempt_not_found", null);
  const [found] = await tx
    .select({ id: paymentAttempts.id, projectId: paymentAttempts.projectId })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.stripeCheckoutSessionId, session.id))
    .limit(1);
  if (!found) return ignored("attempt_not_found", null);

  // 2. Project lock first, 3. attempt lock second (re-reads the state under the lock).
  const [project] = await tx
    .select({ id: projects.id, status: projects.status })
    .from(projects)
    .where(eq(projects.id, found.projectId))
    .limit(1)
    .for("update");
  if (!project) throw new Error("Project of a payment attempt not found");
  const [attempt] = await tx
    .select(attemptColumns)
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, found.id))
    .limit(1)
    .for("update");
  if (!attempt) throw new Error("Payment attempt vanished under lock");

  // 4. Cross-validation against the DB.
  if (!referencesMatch(session, attempt)) {
    console.error("[payments] session references do not match the attempt", {
      attemptId: attempt.id,
    });
    return ignored("reference_mismatch", attempt.id);
  }

  // 5. Outcome.
  if (attempt.status !== "pending") {
    if (outcome === "completed" && (attempt.status === "canceled" || attempt.status === "failed")) {
      console.error("[payments] paid session on a closed attempt; never reopened", {
        attemptId: attempt.id,
        attemptStatus: attempt.status,
      });
    }
    return ignored("attempt_not_pending", attempt.id);
  }

  if (outcome === "expired") {
    return (await cancelPendingAttempt(tx, attempt.id))
      ? applied("canceled", attempt.id)
      : ignored("attempt_not_pending", attempt.id);
  }
  if (outcome === "failed") {
    return (await failPendingAttempt(tx, attempt.id))
      ? applied("failed", attempt.id)
      : ignored("attempt_not_pending", attempt.id);
  }

  if (session.payment_status !== "paid") return ignored("payment_not_paid", attempt.id);
  if (session.currency?.toLowerCase() !== attempt.currency.toLowerCase()) {
    console.error("[payments] currency mismatch; attempt left pending", { attemptId: attempt.id });
    return ignored("currency_mismatch", attempt.id);
  }
  if (session.amount_total !== attempt.amountCents) {
    console.error("[payments] amount mismatch; attempt left pending", { attemptId: attempt.id });
    return ignored("amount_mismatch", attempt.id);
  }
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) {
    console.error("[payments] paid session without PaymentIntent", { attemptId: attempt.id });
    return ignored("missing_payment_intent", attempt.id);
  }

  if (!(await completePendingAttempt(tx, { attemptId: attempt.id, paymentIntentId }))) {
    return ignored("attempt_not_pending", attempt.id);
  }

  if (project.status !== "proposal_selected") {
    // RF6 (D-G): a confirmed payment is a fact; the project is never reopened nor contracted.
    console.error("[payments] payment completed on a project that is not proposal_selected", {
      attemptId: attempt.id,
      projectStatus: project.status,
    });
    return applied("completed_project_not_selected", attempt.id);
  }
  if (!(await markContracted(tx, project.id))) {
    throw new Error("Project could not be contracted under lock");
  }
  return applied("completed", attempt.id);
}

const METADATA_KEYS = [
  ["payment_attempt_id", "id"],
  ["project_id", "projectId"],
  ["proposal_id", "proposalId"],
  ["client_id", "clientId"],
] as const;

function referencesMatch(
  session: Stripe.Checkout.Session,
  attempt: { id: string; projectId: string; proposalId: string; clientId: string },
): boolean {
  if (session.client_reference_id !== attempt.id) return false;
  const metadata = session.metadata ?? {};
  return METADATA_KEYS.every(([key, field]) => {
    const value = metadata[key];
    return value === undefined || value === attempt[field];
  });
}

function applied(reason: AppliedReason, attemptId: string): SessionEffectResult {
  return { result: "applied", reason, attemptId };
}

function ignored(reason: IgnoredReason, attemptId: string | null): SessionEffectResult {
  return { result: "ignored", reason, attemptId };
}
