// @vitest-environment node
// NOTE: PGlite is single-connection and serializes statements: the simultaneous case proves a
// coherent final state (same idempotency key + guarded UPDATE), not real locking under Neon.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

type Obj = Record<string, unknown>;
const stripeState = vi.hoisted(() => ({
  seq: 0,
  accounts: new Map<string, Obj>(),
  transfersByKey: new Map<string, Obj>(),
  createCalls: [] as { params: Obj; options: { idempotencyKey?: string } }[],
  intentCalls: [] as string[],
  intent: null as Obj | null,
  intentError: null as unknown,
  createError: null as unknown,
  createOverride: null as Obj | null,
  accountError: null as unknown,
  configError: null as unknown,
  txSpy: null as null | (() => number),
}));
vi.mock("@/lib/stripe", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/stripe")>();
  const client = {
    paymentIntents: {
      retrieve: async (id: string) => {
        stripeState.intentCalls.push(id);
        if (stripeState.intentError) throw stripeState.intentError;
        return stripeState.intent ?? { id, livemode: false, status: "succeeded", latest_charge: "ch_fake_1" };
      },
    },
    transfers: {
      create: async (params: Obj, options: { idempotencyKey?: string }) => {
        stripeState.createCalls.push({ params, options });
        if (stripeState.txSpy && stripeState.txSpy() > 0) throw new Error("Stripe called inside a transaction");
        if (stripeState.createError) throw stripeState.createError;
        if (stripeState.createOverride) return stripeState.createOverride;
        const key = options.idempotencyKey ?? "";
        const existing = stripeState.transfersByKey.get(key);
        if (existing) return existing;
        const transfer = { id: `tr_fake_${++stripeState.seq}`, livemode: false };
        stripeState.transfersByKey.set(key, transfer);
        return transfer;
      },
    },
    v2: {
      core: {
        accounts: {
          retrieve: async (id: string) => {
            if (stripeState.accountError) throw stripeState.accountError;
            return stripeState.accounts.get(id);
          },
        },
      },
    },
  };
  return {
    ...original,
    getStripe: () => {
      if (stripeState.configError) throw stripeState.configError;
      return client;
    },
  };
});

import { StripeConfigError } from "@/lib/stripe";
import { AuthError } from "@/modules/auth/services/auth-errors";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { connectedAccounts } from "@/modules/payments/schema/connected-accounts.table";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import { users } from "@/modules/users/schema/users.table";
import { insertPendingTransfer } from "./developer-transfer-records";
import {
  executeTransfer,
  retryDeveloperTransfers,
  runTransferForAttempt,
} from "./developer-transfer.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;
let consoleSpies: ReturnType<typeof vi.spyOn>[];

function accountState(status: string, owner?: string): Obj {
  return {
    livemode: false,
    configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status } } } } },
    requirements: { entries: [] },
    metadata: owner ? { nexora_user_id: owner } : undefined,
  };
}

function stripeError(type: string) {
  return Object.assign(new Error("boom acct_secret https://x.stripe.com tr_secret"), {
    type,
    code: "some_code",
    statusCode: 400,
  });
}

function loggedText(): string {
  return consoleSpies
    .flatMap((spy) => spy.mock.calls)
    .map((args) => JSON.stringify(args))
    .join("\n");
}

async function seedUser(role: AuthUser["role"]): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_dts_${n}`, role, displayName: `DT${n}`, email: `dt${n}@example.com` })
    .returning();
  return { id: row.id, clerkUserId: row.clerkUserId, role, displayName: row.displayName, email: row.email };
}

/** Developer with an (optionally active) connected account, project, proposal and a paid attempt + transfer row. */
async function seedTransfer(opts: { account?: "active" | "pending" | "none"; amount?: number; dev?: AuthUser } = {}) {
  const dev = opts.dev ?? (await seedUser("developer"));
  const accountMode = opts.account ?? "active";
  let acct: string | null = null;
  if (accountMode !== "none" && !opts.dev) {
    acct = `acct_fake_${++stripeState.seq}`;
    await ctx.db.insert(connectedAccounts).values({ userId: dev.id, stripeAccountId: acct, status: "active" });
    stripeState.accounts.set(acct, { id: acct, ...accountState(accountMode, dev.id) });
  }
  const amount = opts.amount ?? 250000;
  const client = await seedUser("client");
  const project = await ctx.client.query<{ id: string }>(
    `insert into projects (client_id, title, category, description, budget_min_cents, budget_max_cents, timeline_weeks)
     values ($1, 't', 'web', 'd', 100, 100, 1) returning id`,
    [client.id],
  );
  const proposal = await ctx.client.query<{ id: string }>(
    `insert into proposals (project_id, developer_id, price_cents, timeline_weeks, description)
     values ($1, $2, $3, 1, 'd') returning id`,
    [project.rows[0].id, dev.id, amount],
  );
  const attempt = await ctx.client.query<{ id: string }>(
    `insert into payment_attempts (project_id, proposal_id, client_id, amount_cents, status, stripe_payment_intent_id, completed_at)
     values ($1, $2, $3, $4, 'completed_test', $5, now()) returning id`,
    [project.rows[0].id, proposal.rows[0].id, client.id, amount, `pi_fake_${++stripeState.seq}`],
  );
  await insertPendingTransfer(ctx.db, { attemptId: attempt.rows[0].id });
  const row = await transferOf(attempt.rows[0].id);
  return { dev, acct, amount, attemptId: attempt.rows[0].id, transferId: row.id };
}

async function transferOf(attemptId: string) {
  const [row] = await ctx.db
    .select()
    .from(developerTransfers)
    .where(eq(developerTransfers.paymentAttemptId, attemptId));
  return row;
}

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
});
afterAll(async () => {
  await ctx.client.close();
});
beforeEach(() => {
  Object.assign(stripeState, {
    intent: null,
    intentError: null,
    createError: null,
    createOverride: null,
    accountError: null,
    configError: null,
    txSpy: null,
  });
  stripeState.accounts.clear();
  stripeState.transfersByKey.clear();
  stripeState.createCalls.length = 0;
  stripeState.intentCalls.length = 0;
  holder.db = ctx.db;
  vi.restoreAllMocks();
  consoleSpies = [
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "info").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
  ];
});

describe("executeTransfer happy path (AC5)", () => {
  it("creates one transfer with the exact parameters and completes the row", async () => {
    const { acct, amount, attemptId, transferId } = await seedTransfer();
    expect(await executeTransfer(transferId)).toEqual({ status: "completed_test" });

    expect(stripeState.createCalls).toHaveLength(1);
    const [call] = stripeState.createCalls;
    expect(call.params).toEqual({
      amount,
      currency: "usd",
      destination: acct,
      source_transaction: "ch_fake_1",
      metadata: { nexora_transfer_id: transferId, nexora_payment_attempt_id: attemptId },
    });
    expect(call.params).not.toHaveProperty("transfer_group");
    expect(call.options).toEqual({ idempotencyKey: `nexora:transfer:${transferId}:0` });

    const row = await transferOf(attemptId);
    expect(row.status).toBe("completed_test");
    expect(row.stripeTransferId).toMatch(/^tr_fake_/);
    expect(row.completedAt).toBeInstanceOf(Date);
    expect(row.attemptCount).toBe(1);
    expect(row.lastErrorCode).toBeNull();
  });

  it("a second call is a noop without calling Stripe", async () => {
    const { transferId } = await seedTransfer();
    await executeTransfer(transferId);
    stripeState.createCalls.length = 0;
    stripeState.intentCalls.length = 0;
    expect(await executeTransfer(transferId)).toEqual({ status: "noop" });
    expect(stripeState.createCalls).toHaveLength(0);
    expect(stripeState.intentCalls).toHaveLength(0);
  });

  it("accepts a latest_charge expanded as an object", async () => {
    const { transferId } = await seedTransfer();
    stripeState.intent = { livemode: false, status: "succeeded", latest_charge: { id: "ch_fake_obj" } };
    await executeTransfer(transferId);
    expect(stripeState.createCalls[0].params.source_transaction).toBe("ch_fake_obj");
  });

  it("is a noop for an unknown row, a failed row, or a payment that is not completed", async () => {
    expect(await executeTransfer("00000000-0000-0000-0000-000000000000")).toEqual({ status: "noop" });
    const a = await seedTransfer();
    await ctx.db.update(developerTransfers).set({ status: "failed" }).where(eq(developerTransfers.id, a.transferId));
    expect(await executeTransfer(a.transferId)).toEqual({ status: "noop" });
    const b = await seedTransfer();
    await ctx.client.query(`update payment_attempts set status = 'canceled', completed_at = null where id = $1`, [b.attemptId]);
    expect(await executeTransfer(b.transferId)).toEqual({ status: "noop" });
    expect(stripeState.createCalls).toHaveLength(0);
  });
});

describe("account re-read (AC6)", () => {
  it.each(["pending", "restricted"])(
    "cached active but Stripe says %s: no transfer, pending / ACCOUNT_NOT_ACTIVE",
    async (status) => {
      const { transferId, attemptId } = await seedTransfer({ account: "pending" });
      stripeState.accounts.forEach((a) => Object.assign(a, accountState(status, (a.metadata as Obj).nexora_user_id as string)));
      expect(await executeTransfer(transferId)).toEqual({ status: "pending", reason: "ACCOUNT_NOT_ACTIVE" });
      expect(stripeState.createCalls).toHaveLength(0);
      expect(stripeState.intentCalls).toHaveLength(0);
      expect(await transferOf(attemptId)).toMatchObject({ status: "pending", lastErrorCode: "ACCOUNT_NOT_ACTIVE" });
    },
  );

  it("a developer without a connected account stays pending / ACCOUNT_NOT_ACTIVE", async () => {
    const { transferId } = await seedTransfer({ account: "none" });
    expect(await executeTransfer(transferId)).toEqual({ status: "pending", reason: "ACCOUNT_NOT_ACTIVE" });
    expect(stripeState.createCalls).toHaveLength(0);
  });

  it("a row without acct_ stays pending / ACCOUNT_NOT_ACTIVE", async () => {
    const { transferId, dev } = await seedTransfer({ account: "none" });
    await ctx.db.insert(connectedAccounts).values({ userId: dev.id });
    expect(await executeTransfer(transferId)).toEqual({ status: "pending", reason: "ACCOUNT_NOT_ACTIVE" });
  });

  it("a ConnectedAccountError on re-read gives pending / ACCOUNT_SYNC_FAILED", async () => {
    const { transferId, attemptId } = await seedTransfer();
    stripeState.accountError = stripeError("StripeAPIError");
    expect(await executeTransfer(transferId)).toEqual({ status: "pending", reason: "ACCOUNT_SYNC_FAILED" });
    expect((await transferOf(attemptId)).lastErrorCode).toBe("ACCOUNT_SYNC_FAILED");
    expect(stripeState.createCalls).toHaveLength(0);
  });
});

describe("error classification (AC7)", () => {
  it.each(["StripeInvalidRequestError", "StripeAuthenticationError", "StripePermissionError"])(
    "%s on transfers.create or paymentIntents.retrieve is failed / STRIPE_REJECTED",
    async (type) => {
      const a = await seedTransfer();
      stripeState.createError = stripeError(type);
      expect(await executeTransfer(a.transferId)).toEqual({ status: "failed", reason: "STRIPE_REJECTED" });
      expect(await transferOf(a.attemptId)).toMatchObject({ status: "failed", stripeTransferId: null });

      const b = await seedTransfer();
      stripeState.createError = null;
      stripeState.intentError = stripeError(type);
      expect(await executeTransfer(b.transferId)).toEqual({ status: "failed", reason: "STRIPE_REJECTED" });
    },
  );

  it.each(["StripeConnectionError", "StripeAPIError", "StripeRateLimitError", "StripeIdempotencyError"])(
    "%s is ambiguous: pending / STRIPE_UNAVAILABLE without transfer id",
    async (type) => {
      const a = await seedTransfer();
      stripeState.createError = stripeError(type);
      expect(await executeTransfer(a.transferId)).toEqual({ status: "pending", reason: "STRIPE_UNAVAILABLE" });
      expect(await transferOf(a.attemptId)).toMatchObject({ status: "pending", stripeTransferId: null });

      const b = await seedTransfer();
      stripeState.createError = null;
      stripeState.intentError = stripeError(type);
      expect(await executeTransfer(b.transferId)).toEqual({ status: "pending", reason: "STRIPE_UNAVAILABLE" });
    },
  );

  it("a livemode PaymentIntent is failed / LIVEMODE_REJECTED and never calls transfers.create", async () => {
    const { transferId } = await seedTransfer();
    stripeState.intent = { livemode: true, status: "succeeded", latest_charge: "ch_fake_1" };
    expect(await executeTransfer(transferId)).toEqual({ status: "failed", reason: "LIVEMODE_REJECTED" });
    expect(stripeState.createCalls).toHaveLength(0);
  });

  it("a livemode transfer is failed / LIVEMODE_REJECTED, never completed", async () => {
    const { transferId, attemptId } = await seedTransfer();
    stripeState.createOverride = { id: "tr_fake_live", livemode: true };
    expect(await executeTransfer(transferId)).toEqual({ status: "failed", reason: "LIVEMODE_REJECTED" });
    expect((await transferOf(attemptId)).status).toBe("failed");
  });

  it.each([{ id: "xx_fake", livemode: false }, { livemode: false }, { id: "tr_fake_z" }])(
    "an invalid transfer response (%j) is pending / INVALID_RESPONSE",
    async (override) => {
      const { transferId, attemptId } = await seedTransfer();
      stripeState.createOverride = override;
      expect(await executeTransfer(transferId)).toEqual({ status: "pending", reason: "INVALID_RESPONSE" });
      expect((await transferOf(attemptId)).stripeTransferId).toBeNull();
    },
  );

  it.each([
    [{ livemode: false, status: "processing", latest_charge: "ch_fake_1" }],
    [{ livemode: false, status: "succeeded", latest_charge: null }],
  ])("an unsettled payment (%j) is pending / PAYMENT_NOT_SETTLED", async (intent) => {
    const { transferId } = await seedTransfer();
    stripeState.intent = intent;
    expect(await executeTransfer(transferId)).toEqual({ status: "pending", reason: "PAYMENT_NOT_SETTLED" });
    expect(stripeState.createCalls).toHaveLength(0);
  });

  it("a missing or live key gives pending / STRIPE_NOT_CONFIGURED without calling Stripe", async () => {
    const { transferId, attemptId } = await seedTransfer();
    stripeState.configError = new StripeConfigError("STRIPE_SECRET_KEY is a live key; only test keys are accepted.");
    expect(await executeTransfer(transferId)).toEqual({ status: "pending", reason: "STRIPE_NOT_CONFIGURED" });
    expect(await transferOf(attemptId)).toMatchObject({ status: "pending", lastErrorCode: "STRIPE_NOT_CONFIGURED" });
    expect(stripeState.createCalls).toHaveLength(0);
  });

  it("logs never contain Stripe ids, URLs, emails or amounts", async () => {
    const a = await seedTransfer({ amount: 987654 });
    stripeState.createError = stripeError("StripeInvalidRequestError");
    await executeTransfer(a.transferId);
    stripeState.createError = null;
    await executeTransfer((await seedTransfer()).transferId);
    const text = loggedText();
    for (const forbidden of ["acct_", "tr_", "pi_", "ch_", "stripe.com", "@example.com", "987654", "sk_"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("idempotency (AC8)", () => {
  it("simultaneous executions use the same key and leave one transfer and one completed row", async () => {
    const { transferId, attemptId } = await seedTransfer();
    const results = await Promise.allSettled([executeTransfer(transferId), executeTransfer(transferId)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(new Set(stripeState.createCalls.map((c) => c.options.idempotencyKey))).toEqual(
      new Set([`nexora:transfer:${transferId}:0`]),
    );
    expect(stripeState.transfersByKey.size).toBe(1);
    const rows = await ctx.db.select().from(developerTransfers).where(eq(developerTransfers.paymentAttemptId, attemptId));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed_test");
  });

  it("a retry after an ambiguous failure reuses the same key and creates a single transfer", async () => {
    const { transferId, attemptId } = await seedTransfer();
    stripeState.createError = stripeError("StripeConnectionError");
    await executeTransfer(transferId);
    stripeState.createError = null;
    expect(await executeTransfer(transferId)).toEqual({ status: "completed_test" });
    const keys = stripeState.createCalls.map((c) => c.options.idempotencyKey);
    expect(keys).toEqual([`nexora:transfer:${transferId}:0`, `nexora:transfer:${transferId}:0`]);
    expect(stripeState.transfersByKey.size).toBe(1);
    expect((await transferOf(attemptId)).attemptCount).toBe(2);
  });

  it("if the DB fails after creating the transfer the row stays pending and the retry completes without a second transfer", async () => {
    const { transferId, attemptId } = await seedTransfer();
    const realDb = ctx.db;
    let armed = true;
    holder.db = new Proxy(realDb, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== "update" || typeof value !== "function") return value;
        return (...args: unknown[]) => {
          const builder = (value as (...a: unknown[]) => { set: (v: Obj) => unknown }).apply(target, args);
          return new Proxy(builder as object, {
            get(b, p, r) {
              if (p === "set") {
                return (values: Obj) => {
                  if (armed && values.status === "completed_test") {
                    armed = false;
                    throw new Error("db down");
                  }
                  return (b as { set: (v: Obj) => unknown }).set(values);
                };
              }
              return Reflect.get(b, p, r);
            },
          });
        };
      },
    });
    await expect(executeTransfer(transferId)).rejects.toThrow("db down");
    holder.db = realDb;
    expect(await transferOf(attemptId)).toMatchObject({ status: "pending", stripeTransferId: null });

    expect(await executeTransfer(transferId)).toEqual({ status: "completed_test" });
    expect(stripeState.transfersByKey.size).toBe(1);
    expect(stripeState.createCalls).toHaveLength(2);
  });
});

describe("retryDeveloperTransfers (AC8, AC9)", () => {
  it.each(["client", "admin"] as const)("%s gets FORBIDDEN without touching DB or Stripe", async (role) => {
    const actor = await seedUser(role);
    holder.db = new Proxy({}, { get: () => { throw new Error("DB must not be touched"); } });
    const err = await retryDeveloperTransfers(actor).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe("FORBIDDEN");
    expect(stripeState.createCalls).toHaveLength(0);
  });

  it("a failed transfer is reopened with a new generation only with includeFailed", async () => {
    const a = await seedTransfer();
    stripeState.createError = stripeError("StripeInvalidRequestError");
    await executeTransfer(a.transferId);
    expect((await transferOf(a.attemptId)).status).toBe("failed");
    stripeState.createError = null;
    stripeState.createCalls.length = 0;

    expect(await retryDeveloperTransfers(a.dev)).toEqual({ attempted: 0, completed: 0, pending: 0, failed: 0 });
    expect(stripeState.createCalls).toHaveLength(0);

    expect(await retryDeveloperTransfers(a.dev, { includeFailed: true })).toEqual({
      attempted: 1,
      completed: 1,
      pending: 0,
      failed: 0,
    });
    expect(stripeState.createCalls[0].options.idempotencyKey).toBe(`nexora:transfer:${a.transferId}:1`);
    expect(await transferOf(a.attemptId)).toMatchObject({ status: "completed_test", retryGeneration: 1 });
  });

  it("only processes the actor's own rows", async () => {
    const mine = await seedTransfer();
    const theirs = await seedTransfer();
    const result = await retryDeveloperTransfers(mine.dev);
    expect(result).toEqual({ attempted: 1, completed: 1, pending: 0, failed: 0 });
    expect((await transferOf(theirs.attemptId)).status).toBe("pending");
    expect(stripeState.createCalls.map((c) => c.params.destination)).toEqual([mine.acct]);
  });

  it("processes at most 10 rows, oldest first, and returns the counters", async () => {
    const first = await seedTransfer();
    const extra = [];
    for (let i = 0; i < 11; i++) extra.push(await seedTransfer({ dev: first.dev }));
    const result = await retryDeveloperTransfers(first.dev);
    expect(result).toEqual({ attempted: 10, completed: 10, pending: 0, failed: 0 });
    expect((await transferOf(first.attemptId)).status).toBe("completed_test");
    expect((await transferOf(extra[10].attemptId)).status).toBe("pending");
  });

  it("counts pending and failed outcomes", async () => {
    const a = await seedTransfer();
    await seedTransfer({ dev: a.dev });
    stripeState.createError = stripeError("StripeConnectionError");
    expect(await retryDeveloperTransfers(a.dev)).toEqual({ attempted: 2, completed: 0, pending: 2, failed: 0 });
    stripeState.createError = stripeError("StripeInvalidRequestError");
    expect(await retryDeveloperTransfers(a.dev)).toEqual({ attempted: 2, completed: 0, pending: 0, failed: 2 });
  });
});

describe("runTransferForAttempt (AC9)", () => {
  it("executes the transfer of the attempt", async () => {
    const { attemptId } = await seedTransfer();
    await runTransferForAttempt(attemptId);
    expect((await transferOf(attemptId)).status).toBe("completed_test");
  });

  it("does nothing for an attempt without a transfer", async () => {
    await expect(runTransferForAttempt("00000000-0000-0000-0000-000000000000")).resolves.toBeUndefined();
    expect(stripeState.createCalls).toHaveLength(0);
  });

  it("never throws on Stripe or DB errors and logs only the error name", async () => {
    const { attemptId } = await seedTransfer();
    stripeState.accountError = new Error("unexpected acct_secret");
    await expect(runTransferForAttempt(attemptId)).resolves.toBeUndefined();
    stripeState.accountError = null;

    holder.db = new Proxy({}, { get: () => { throw new Error("db down tr_secret"); } });
    await expect(runTransferForAttempt(attemptId)).resolves.toBeUndefined();
    const text = loggedText();
    expect(text).not.toContain("acct_secret");
    expect(text).not.toContain("tr_secret");
  });
});

describe("no Stripe call inside a transaction (AC10)", () => {
  it("opens no transaction and calls Stripe outside any", async () => {
    const { transferId } = await seedTransfer();
    const spy = vi.spyOn(ctx.db, "transaction");
    stripeState.txSpy = () => spy.mock.calls.length;
    expect(await executeTransfer(transferId)).toEqual({ status: "completed_test" });
    expect(spy).not.toHaveBeenCalled();
    expect(stripeState.createCalls).toHaveLength(1);
  });
});
