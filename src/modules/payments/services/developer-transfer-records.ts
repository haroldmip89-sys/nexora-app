import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import type { TransferReason } from "@/modules/payments/types/developer-transfer.types";
import { proposals } from "@/modules/proposals/schema/proposals.table";

/**
 * Leaf operations of `developer_transfers` (spec 011b RF1). They receive the caller's executor
 * (usually a `tx`), never import `db`, and carry the state guard in the WHERE: each update returns
 * true only if a row in the expected state was updated.
 */
type Executor = Pick<PgDatabase<PgQueryResultHKT>, "select" | "insert" | "update">;

/**
 * Creates the `pending` transfer of a payment attempt. The developer comes from the attempt's
 * proposal and the amount/currency from the attempt; nothing is taken from the caller.
 * Returns true only if a row was inserted (ON CONFLICT DO NOTHING on `payment_attempt_id`).
 */
export async function insertPendingTransfer(
  executor: Executor,
  input: { attemptId: string },
): Promise<boolean> {
  const [source] = await executor
    .select({
      developerId: proposals.developerId,
      amountCents: paymentAttempts.amountCents,
      currency: paymentAttempts.currency,
    })
    .from(paymentAttempts)
    .innerJoin(proposals, eq(proposals.id, paymentAttempts.proposalId))
    .where(eq(paymentAttempts.id, input.attemptId))
    .limit(1);
  if (!source) return false;

  const rows = await executor
    .insert(developerTransfers)
    .values({
      paymentAttemptId: input.attemptId,
      developerId: source.developerId,
      amountCents: source.amountCents,
      currency: source.currency,
    })
    .onConflictDoNothing({ target: developerTransfers.paymentAttemptId })
    .returning({ id: developerTransfers.id });
  return rows.length === 1;
}

const pendingGuard = (transferId: string) =>
  and(eq(developerTransfers.id, transferId), eq(developerTransfers.status, "pending"));

/** Counts one execution attempt on a `pending` row. */
export async function markTransferAttempted(
  executor: Executor,
  transferId: string,
): Promise<boolean> {
  const rows = await executor
    .update(developerTransfers)
    .set({ attemptCount: sql`${developerTransfers.attemptCount} + 1`, lastAttemptAt: new Date() })
    .where(pendingGuard(transferId))
    .returning({ id: developerTransfers.id });
  return rows.length === 1;
}

/** Keeps a `pending` row pending and records why. */
export async function markTransferPending(
  executor: Executor,
  transferId: string,
  reason: TransferReason,
): Promise<boolean> {
  const rows = await executor
    .update(developerTransfers)
    .set({ lastErrorCode: reason })
    .where(pendingGuard(transferId))
    .returning({ id: developerTransfers.id });
  return rows.length === 1;
}

/** pending -> failed. */
export async function markTransferFailed(
  executor: Executor,
  transferId: string,
  reason: TransferReason,
): Promise<boolean> {
  const rows = await executor
    .update(developerTransfers)
    .set({ status: "failed", lastErrorCode: reason })
    .where(pendingGuard(transferId))
    .returning({ id: developerTransfers.id });
  return rows.length === 1;
}

/** pending -> completed_test, stamping the Stripe transfer id and `completed_at` (satisfies the CHECKs). */
export async function markTransferCompleted(
  executor: Executor,
  transferId: string,
  stripeTransferId: string,
): Promise<boolean> {
  const rows = await executor
    .update(developerTransfers)
    .set({
      status: "completed_test",
      stripeTransferId,
      completedAt: new Date(),
      lastErrorCode: null,
    })
    .where(pendingGuard(transferId))
    .returning({ id: developerTransfers.id });
  return rows.length === 1;
}

/** failed -> pending with the next idempotency generation; only for the owning developer. */
export async function reopenFailedTransfer(
  executor: Executor,
  input: { transferId: string; developerId: string },
): Promise<boolean> {
  const rows = await executor
    .update(developerTransfers)
    .set({
      status: "pending",
      retryGeneration: sql`${developerTransfers.retryGeneration} + 1`,
    })
    .where(
      and(
        eq(developerTransfers.id, input.transferId),
        eq(developerTransfers.developerId, input.developerId),
        eq(developerTransfers.status, "failed"),
      ),
    )
    .returning({ id: developerTransfers.id });
  return rows.length === 1;
}
