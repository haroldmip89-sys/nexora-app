// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/test-db";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import {
  insertPendingTransfer,
  markTransferAttempted,
  markTransferCompleted,
  markTransferFailed,
  markTransferPending,
  reopenFailedTransfer,
} from "./developer-transfer-records";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

async function createUser(role: string): Promise<string> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into users (clerk_user_id, role, display_name, email) values ($1, $2, 'Name', 'a@b.com') returning id`,
    [`clerk_tr_${++seq}`, role],
  );
  return rows[0].id;
}

async function createAttempt(amount = 12345) {
  const clientId = await createUser("client");
  const developerId = await createUser("developer");
  const project = await ctx.client.query<{ id: string }>(
    `insert into projects (client_id, title, category, description, budget_min_cents, budget_max_cents, timeline_weeks)
     values ($1, 't', 'web', 'd', 100, 100, 1) returning id`,
    [clientId],
  );
  const proposal = await ctx.client.query<{ id: string }>(
    `insert into proposals (project_id, developer_id, price_cents, timeline_weeks, description)
     values ($1, $2, $3, 1, 'd') returning id`,
    [project.rows[0].id, developerId, amount],
  );
  const attempt = await ctx.client.query<{ id: string }>(
    `insert into payment_attempts (project_id, proposal_id, client_id, amount_cents)
     values ($1, $2, $3, $4) returning id`,
    [project.rows[0].id, proposal.rows[0].id, clientId, amount],
  );
  return { attemptId: attempt.rows[0].id, developerId };
}

async function rowFor(attemptId: string) {
  const [row] = await ctx.db
    .select()
    .from(developerTransfers)
    .where(eq(developerTransfers.paymentAttemptId, attemptId));
  return row;
}

describe("insertPendingTransfer", () => {
  it("creates a pending row with the proposal's developer and the attempt's amount and currency", async () => {
    const { attemptId, developerId } = await createAttempt(54321);
    expect(await insertPendingTransfer(ctx.db, { attemptId })).toBe(true);
    const row = await rowFor(attemptId);
    expect(row).toMatchObject({
      developerId,
      amountCents: 54321,
      currency: "USD",
      status: "pending",
      stripeTransferId: null,
      retryGeneration: 0,
      attemptCount: 0,
    });
  });

  it("a second call does not insert and leaves a single row", async () => {
    const { attemptId } = await createAttempt();
    expect(await insertPendingTransfer(ctx.db, { attemptId })).toBe(true);
    expect(await insertPendingTransfer(ctx.db, { attemptId })).toBe(false);
    const rows = await ctx.db
      .select()
      .from(developerTransfers)
      .where(eq(developerTransfers.paymentAttemptId, attemptId));
    expect(rows).toHaveLength(1);
  });

  it("returns false for an unknown attempt", async () => {
    expect(
      await insertPendingTransfer(ctx.db, { attemptId: "00000000-0000-0000-0000-000000000000" }),
    ).toBe(false);
  });

  it("works inside a transaction and rolls back with it", async () => {
    const { attemptId } = await createAttempt();
    await ctx.db
      .transaction(async (tx) => {
        expect(await insertPendingTransfer(tx, { attemptId })).toBe(true);
        throw new Error("force rollback");
      })
      .catch(() => {});
    expect(await rowFor(attemptId)).toBeUndefined();
  });
});

describe("state leaves and their guards", () => {
  async function pendingRow() {
    const a = await createAttempt();
    await insertPendingTransfer(ctx.db, { attemptId: a.attemptId });
    return { ...a, row: await rowFor(a.attemptId) };
  }

  it("markTransferAttempted counts attempts only on pending rows", async () => {
    const { row, attemptId } = await pendingRow();
    expect(await markTransferAttempted(ctx.db, row.id)).toBe(true);
    const after = await rowFor(attemptId);
    expect(after.attemptCount).toBe(1);
    expect(after.lastAttemptAt).toBeInstanceOf(Date);
    await markTransferFailed(ctx.db, row.id, "STRIPE_REJECTED");
    expect(await markTransferAttempted(ctx.db, row.id)).toBe(false);
  });

  it("markTransferPending records the reason and keeps pending", async () => {
    const { row, attemptId } = await pendingRow();
    expect(await markTransferPending(ctx.db, row.id, "ACCOUNT_NOT_ACTIVE")).toBe(true);
    expect(await rowFor(attemptId)).toMatchObject({
      status: "pending",
      lastErrorCode: "ACCOUNT_NOT_ACTIVE",
    });
  });

  it("markTransferFailed only moves pending rows", async () => {
    const { row, attemptId } = await pendingRow();
    expect(await markTransferFailed(ctx.db, row.id, "STRIPE_REJECTED")).toBe(true);
    expect(await rowFor(attemptId)).toMatchObject({ status: "failed", lastErrorCode: "STRIPE_REJECTED" });
    expect(await markTransferFailed(ctx.db, row.id, "LIVEMODE_REJECTED")).toBe(false);
    expect((await rowFor(attemptId)).lastErrorCode).toBe("STRIPE_REJECTED");
  });

  it("markTransferCompleted stamps id and date, clears the error, and is terminal", async () => {
    const { row, attemptId } = await pendingRow();
    await markTransferPending(ctx.db, row.id, "STRIPE_UNAVAILABLE");
    expect(await markTransferCompleted(ctx.db, row.id, "tr_fake_done")).toBe(true);
    const done = await rowFor(attemptId);
    expect(done).toMatchObject({
      status: "completed_test",
      stripeTransferId: "tr_fake_done",
      lastErrorCode: null,
    });
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(await markTransferCompleted(ctx.db, row.id, "tr_fake_other")).toBe(false);
    expect(await markTransferFailed(ctx.db, row.id, "STRIPE_REJECTED")).toBe(false);
    expect((await rowFor(attemptId)).stripeTransferId).toBe("tr_fake_done");
  });

  it("reopenFailedTransfer needs failed status and the owner, and bumps the generation", async () => {
    const { row, attemptId, developerId } = await pendingRow();
    const other = await createUser("developer");
    expect(await reopenFailedTransfer(ctx.db, { transferId: row.id, developerId })).toBe(false);
    await markTransferFailed(ctx.db, row.id, "STRIPE_REJECTED");
    expect(await reopenFailedTransfer(ctx.db, { transferId: row.id, developerId: other })).toBe(false);
    expect((await rowFor(attemptId)).status).toBe("failed");
    expect(await reopenFailedTransfer(ctx.db, { transferId: row.id, developerId })).toBe(true);
    expect(await rowFor(attemptId)).toMatchObject({ status: "pending", retryGeneration: 1 });
  });
});
