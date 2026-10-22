import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";

/**
 * Leaf transitions of a payment attempt (spec 010 RF5). They receive the caller's executor
 * (usually a `tx`), never import `db`, and carry the state guard in the WHERE: each returns true
 * only if a `pending` row was updated.
 */
type Executor = Pick<PgDatabase<PgQueryResultHKT>, "update">;

/** pending -> completed_test, stamping the PaymentIntent id and `completed_at` (satisfies the CHECK). */
export async function completePendingAttempt(
  executor: Executor,
  input: { attemptId: string; paymentIntentId: string },
): Promise<boolean> {
  const rows = await executor
    .update(paymentAttempts)
    .set({
      status: "completed_test",
      stripePaymentIntentId: input.paymentIntentId,
      completedAt: new Date(),
    })
    .where(and(eq(paymentAttempts.id, input.attemptId), eq(paymentAttempts.status, "pending")))
    .returning({ id: paymentAttempts.id });
  return rows.length === 1;
}

/** pending -> failed. */
export async function failPendingAttempt(executor: Executor, attemptId: string): Promise<boolean> {
  return setPendingStatus(executor, attemptId, "failed");
}

/** pending -> canceled. */
export async function cancelPendingAttempt(
  executor: Executor,
  attemptId: string,
): Promise<boolean> {
  return setPendingStatus(executor, attemptId, "canceled");
}

/** pending -> canceled only while no Checkout session id is stored (nobody got the URL). */
export async function cancelPendingAttemptWithoutSession(
  executor: Executor,
  attemptId: string,
): Promise<boolean> {
  const rows = await executor
    .update(paymentAttempts)
    .set({ status: "canceled" })
    .where(
      and(
        eq(paymentAttempts.id, attemptId),
        eq(paymentAttempts.status, "pending"),
        isNull(paymentAttempts.stripeCheckoutSessionId),
      ),
    )
    .returning({ id: paymentAttempts.id });
  return rows.length === 1;
}

async function setPendingStatus(
  executor: Executor,
  attemptId: string,
  status: "failed" | "canceled",
): Promise<boolean> {
  const rows = await executor
    .update(paymentAttempts)
    .set({ status })
    .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.status, "pending")))
    .returning({ id: paymentAttempts.id });
  return rows.length === 1;
}
