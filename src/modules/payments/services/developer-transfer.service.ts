import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  getStripe,
  isDefinitiveStripeRejection,
  StripeConfigError,
  stripeErrorLogFields,
} from "@/lib/stripe";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { ConnectedAccountError } from "@/modules/payments/services/connected-account-errors";
import { syncConnectedAccountForUser } from "@/modules/payments/services/connected-account.service";
import {
  markTransferAttempted,
  markTransferCompleted,
  markTransferFailed,
  markTransferPending,
  reopenFailedTransfer,
} from "@/modules/payments/services/developer-transfer-records";
import type {
  RetryTransfersResult,
  TransferExecutionResult,
  TransferReason,
} from "@/modules/payments/types/developer-transfer.types";

const STRIPE_TRANSFER_ID_PREFIX = "tr_";
const MAX_RETRY_BATCH = 10;

type Outcome = Exclude<TransferExecutionResult, { status: "noop" | "completed_test" }>;

const pending = (reason: TransferReason): Outcome => ({ status: "pending", reason });
const failed = (reason: TransferReason): Outcome => ({ status: "failed", reason });

/** Writes a non-completed outcome (one short write) and logs one line without PII or Stripe data. */
async function settle(transferId: string, outcome: Outcome): Promise<Outcome> {
  if (outcome.status === "failed") await markTransferFailed(db, transferId, outcome.reason);
  else await markTransferPending(db, transferId, outcome.reason);
  console.info("[payments] transfer", {
    transferId,
    status: outcome.status,
    reason: outcome.reason,
  });
  return outcome;
}

/**
 * Executes (or resumes) one transfer (spec 011b RF3). Internal, no actor: callers are the verified
 * webhook, the owner's reconciliation and `retryDeveloperTransfers`. No Stripe call runs inside a
 * transaction (none is opened here). The idempotency key is deterministic per row and generation.
 */
export async function executeTransfer(transferId: string): Promise<TransferExecutionResult> {
  // 1. Stripe client (a config error is recorded after the row is known to be processable).
  let stripe: ReturnType<typeof getStripe> | null = null;
  let configError: StripeConfigError | null = null;
  try {
    stripe = getStripe();
  } catch (e) {
    if (!(e instanceof StripeConfigError)) throw e;
    configError = e;
  }

  // 2. Row + attempt.
  const [row] = await db
    .select({
      id: developerTransfers.id,
      attemptId: developerTransfers.paymentAttemptId,
      developerId: developerTransfers.developerId,
      amountCents: developerTransfers.amountCents,
      status: developerTransfers.status,
      retryGeneration: developerTransfers.retryGeneration,
      attemptStatus: paymentAttempts.status,
      paymentIntentId: paymentAttempts.stripePaymentIntentId,
    })
    .from(developerTransfers)
    .innerJoin(paymentAttempts, eq(paymentAttempts.id, developerTransfers.paymentAttemptId))
    .where(eq(developerTransfers.id, transferId))
    .limit(1);
  if (
    !row ||
    row.status !== "pending" ||
    row.attemptStatus !== "completed_test" ||
    !row.paymentIntentId
  ) {
    return { status: "noop" };
  }
  if (!(await markTransferAttempted(db, row.id))) return { status: "noop" };

  if (!stripe) {
    console.error("[payments] Stripe is not configured:", configError?.message);
    return settle(row.id, pending("STRIPE_NOT_CONFIGURED"));
  }

  // 3. Re-read the connected account (the cached status may be stale).
  let destination: string | null;
  try {
    const account = await syncConnectedAccountForUser(row.developerId);
    destination = account.status === "active" ? account.stripeAccountId : null;
  } catch (e) {
    if (e instanceof ConnectedAccountError) return settle(row.id, pending("ACCOUNT_SYNC_FAILED"));
    throw e;
  }
  if (!destination) return settle(row.id, pending("ACCOUNT_NOT_ACTIVE"));

  // 4. The charge of the payment.
  let chargeId: string;
  try {
    const intent = await stripe.paymentIntents.retrieve(row.paymentIntentId);
    if (intent?.livemode !== false) return settle(row.id, failed("LIVEMODE_REJECTED"));
    const charge = intent.latest_charge;
    const id = typeof charge === "string" ? charge : charge?.id;
    if (intent.status !== "succeeded" || !id) return settle(row.id, pending("PAYMENT_NOT_SETTLED"));
    chargeId = id;
  } catch (e) {
    console.error("[payments] Stripe payment intent retrieve failed:", {
      transferId: row.id,
      ...stripeErrorLogFields(e),
    });
    return settle(
      row.id,
      isDefinitiveStripeRejection(e) ? failed("STRIPE_REJECTED") : pending("STRIPE_UNAVAILABLE"),
    );
  }

  // 5. Transfer (amount always from the row).
  if (!Number.isSafeInteger(row.amountCents) || row.amountCents <= 0) {
    return settle(row.id, failed("INVALID_RESPONSE"));
  }
  let transfer: Awaited<ReturnType<typeof stripe.transfers.create>>;
  try {
    transfer = await stripe.transfers.create(
      {
        amount: row.amountCents,
        currency: "usd",
        destination,
        source_transaction: chargeId,
        metadata: { nexora_transfer_id: row.id, nexora_payment_attempt_id: row.attemptId },
      },
      { idempotencyKey: `nexora:transfer:${row.id}:${row.retryGeneration}` },
    );
  } catch (e) {
    console.error("[payments] Stripe transfer failed:", {
      transferId: row.id,
      ...stripeErrorLogFields(e),
    });
    return settle(
      row.id,
      isDefinitiveStripeRejection(e) ? failed("STRIPE_REJECTED") : pending("STRIPE_UNAVAILABLE"),
    );
  }

  // 6. Validate the response (never stored nor logged as an object).
  if (transfer?.livemode === true) return settle(row.id, failed("LIVEMODE_REJECTED"));
  const stripeTransferId = transfer?.id;
  if (
    typeof stripeTransferId !== "string" ||
    !stripeTransferId.startsWith(STRIPE_TRANSFER_ID_PREFIX) ||
    transfer.livemode !== false
  ) {
    return settle(row.id, pending("INVALID_RESPONSE"));
  }

  // 7. Persist. If this fails the row stays pending and the retry (same key) returns the same transfer.
  if (!(await markTransferCompleted(db, row.id, stripeTransferId))) return { status: "noop" };
  console.info("[payments] transfer", { transferId: row.id, status: "completed_test" });
  return { status: "completed_test" };
}

/** Runs the transfer of a payment attempt, if any. Never throws; logs the error name only. */
export async function runTransferForAttempt(attemptId: string): Promise<void> {
  try {
    const [row] = await db
      .select({ id: developerTransfers.id })
      .from(developerTransfers)
      .where(eq(developerTransfers.paymentAttemptId, attemptId))
      .limit(1);
    if (!row) return;
    await executeTransfer(row.id);
  } catch (e) {
    console.error("[payments] transfer run failed:", {
      attemptId,
      error: e instanceof Error ? e.name : "unknown",
    });
  }
}

/**
 * Retries the actor's own transfers (spec 011b RF3): `pending` ones, plus `failed` ones (reopened
 * with a new idempotency generation) when `includeFailed`. At most 10, oldest first, sequential.
 */
export async function retryDeveloperTransfers(
  actor: AuthUser,
  opts: { includeFailed?: boolean } = {},
): Promise<RetryTransfersResult> {
  if (!can(actor.role, "transfer.retry")) throw new AuthError("FORBIDDEN");

  const rows = await db
    .select({ id: developerTransfers.id, status: developerTransfers.status })
    .from(developerTransfers)
    .where(
      and(
        eq(developerTransfers.developerId, actor.id),
        inArray(developerTransfers.status, opts.includeFailed ? ["pending", "failed"] : ["pending"]),
      ),
    )
    .orderBy(asc(developerTransfers.createdAt))
    .limit(MAX_RETRY_BATCH);

  const result: RetryTransfersResult = { attempted: 0, completed: 0, pending: 0, failed: 0 };
  for (const row of rows) {
    if (row.status === "failed") {
      const reopened = await reopenFailedTransfer(db, { transferId: row.id, developerId: actor.id });
      if (!reopened) continue;
    }
    result.attempted++;
    try {
      const outcome = await executeTransfer(row.id);
      if (outcome.status === "completed_test") result.completed++;
      else if (outcome.status === "pending") result.pending++;
      else if (outcome.status === "failed") result.failed++;
    } catch (e) {
      console.error("[payments] transfer retry failed:", {
        transferId: row.id,
        error: e instanceof Error ? e.name : "unknown",
      });
      result.pending++;
    }
  }
  return result;
}
