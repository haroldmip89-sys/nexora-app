// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";

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
    [`clerk_dt_${++seq}`, role],
  );
  return rows[0].id;
}

/** A project with a proposal and a payment attempt (one per call, so each has its own attempt). */
async function createAttempt(): Promise<{ attemptId: string; developerId: string; clientId: string }> {
  const clientId = await createUser("client");
  const developerId = await createUser("developer");
  const project = await ctx.client.query<{ id: string }>(
    `insert into projects (client_id, title, category, description, budget_min_cents, budget_max_cents, timeline_weeks)
     values ($1, 't', 'web', 'd', 100, 100, 1) returning id`,
    [clientId],
  );
  const projectId = project.rows[0].id;
  const proposal = await ctx.client.query<{ id: string }>(
    `insert into proposals (project_id, developer_id, price_cents, timeline_weeks, description)
     values ($1, $2, 100, 1, 'd') returning id`,
    [projectId, developerId],
  );
  const attempt = await ctx.client.query<{ id: string }>(
    `insert into payment_attempts (project_id, proposal_id, client_id, amount_cents)
     values ($1, $2, $3, 100) returning id`,
    [projectId, proposal.rows[0].id, clientId],
  );
  return { attemptId: attempt.rows[0].id, developerId, clientId };
}

type Overrides = {
  attemptId: string;
  developerId: string;
  amount?: number;
  currency?: string;
  status?: string;
  stripeId?: string | null;
  completedAt?: string | null;
  retryGeneration?: number;
  attemptCount?: number;
};

const insert = (o: Overrides) =>
  ctx.client.query(
    `insert into developer_transfers
       (payment_attempt_id, developer_id, amount_cents, currency, status, stripe_transfer_id, completed_at, retry_generation, attempt_count)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      o.attemptId,
      o.developerId,
      o.amount ?? 100,
      o.currency ?? "USD",
      o.status ?? "pending",
      o.stripeId ?? null,
      o.completedAt ?? null,
      o.retryGeneration ?? 0,
      o.attemptCount ?? 0,
    ],
  );

const NOW = "2026-01-01T00:00:00Z";

describe("developer_transfers constraints", () => {
  it("accepts a pending row and a completed_test row", async () => {
    const a = await createAttempt();
    const b = await createAttempt();
    await expect(insert(a)).resolves.toBeDefined();
    await expect(
      insert({ ...b, status: "completed_test", stripeId: "tr_fake_ok", completedAt: NOW }),
    ).resolves.toBeDefined();
  });

  it("rejects a second transfer for the same payment attempt", async () => {
    const a = await createAttempt();
    await insert(a);
    await expect(insert(a)).rejects.toThrow();
  });

  it("rejects two rows with the same stripe_transfer_id", async () => {
    const a = await createAttempt();
    const b = await createAttempt();
    const done = { status: "completed_test", stripeId: "tr_fake_shared", completedAt: NOW };
    await insert({ ...a, ...done });
    await expect(insert({ ...b, ...done })).rejects.toThrow();
  });

  it("rejects completed_test without stripe_transfer_id or without completed_at", async () => {
    const a = await createAttempt();
    const b = await createAttempt();
    await expect(
      insert({ ...a, status: "completed_test", stripeId: null, completedAt: NOW }),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      insert({ ...b, status: "completed_test", stripeId: "tr_fake_x", completedAt: null }),
    ).rejects.toThrow(/check constraint/i);
  });

  it("rejects pending or failed with stripe_transfer_id", async () => {
    const a = await createAttempt();
    const b = await createAttempt();
    await expect(insert({ ...a, status: "pending", stripeId: "tr_fake_p" })).rejects.toThrow(
      /check constraint/i,
    );
    await expect(insert({ ...b, status: "failed", stripeId: "tr_fake_f" })).rejects.toThrow(
      /check constraint/i,
    );
  });

  it("rejects a stripe_transfer_id without the tr_ prefix", async () => {
    const a = await createAttempt();
    const b = await createAttempt();
    const c = await createAttempt();
    const done = { status: "completed_test", completedAt: NOW };
    await expect(insert({ ...a, ...done, stripeId: "xr_fake" })).rejects.toThrow(/check constraint/i);
    await expect(insert({ ...b, ...done, stripeId: "trXfake" })).rejects.toThrow(/check constraint/i);
    await expect(insert({ ...c, ...done, stripeId: "tr_fake_ok2" })).resolves.toBeDefined();
  });

  it("rejects non-positive amounts, non-USD currency and negative counters", async () => {
    const a = await createAttempt();
    await expect(insert({ ...a, amount: 0 })).rejects.toThrow(/check constraint/i);
    await expect(insert({ ...a, amount: -5 })).rejects.toThrow(/check constraint/i);
    await expect(insert({ ...a, currency: "EUR" })).rejects.toThrow(/check constraint/i);
    await expect(insert({ ...a, retryGeneration: -1 })).rejects.toThrow(/check constraint/i);
    await expect(insert({ ...a, attemptCount: -1 })).rejects.toThrow(/check constraint/i);
  });

  it("rejects deleting the referenced attempt or developer (restrict)", async () => {
    const a = await createAttempt();
    await insert(a);
    await expect(
      ctx.client.query(`delete from payment_attempts where id = $1`, [a.attemptId]),
    ).rejects.toThrow();
    await expect(
      ctx.client.query(`delete from users where id = $1`, [a.developerId]),
    ).rejects.toThrow();
  });
});
