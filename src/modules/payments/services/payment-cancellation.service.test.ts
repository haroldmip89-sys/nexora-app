// @vitest-environment node
// NOTE: PGlite is single-connection and serializes transactions: the race cases prove a coherent final
// state, not the real FOR UPDATE behavior under concurrency (validated by reading the SQL).
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

const transferMock = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/modules/payments/services/developer-transfer.service", () => ({
  runTransferForAttempt: transferMock.run,
}));

const stripeState = vi.hoisted(() => ({
  sessions: new Map<string, Record<string, unknown>>(),
  expireCalls: [] as string[],
  retrieveCalls: [] as string[],
  createCalls: 0,
  expireError: null as unknown,
  retrieveError: null as unknown,
  configError: null as unknown,
  onExpire: undefined as undefined | ((id: string) => Promise<void>),
  seq: 0,
}));
vi.mock("@/lib/stripe", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/stripe")>();
  const client = {
    checkout: {
      sessions: {
        // Fake of Stripe's behavior: expire only works on an open session; the result is `expired`.
        expire: async (id: string) => {
          stripeState.expireCalls.push(id);
          if (stripeState.onExpire) await stripeState.onExpire(id);
          if (stripeState.expireError) throw stripeState.expireError;
          const current = stripeState.sessions.get(id);
          if (!current) throw Object.assign(new Error("missing"), { type: "StripeInvalidRequestError" });
          const expired = { ...current, status: "expired", payment_status: "unpaid" };
          stripeState.sessions.set(id, expired);
          return expired;
        },
        retrieve: async (id: string) => {
          stripeState.retrieveCalls.push(id);
          if (stripeState.retrieveError) throw stripeState.retrieveError;
          return stripeState.sessions.get(id);
        },
        create: async () => {
          stripeState.createCalls++;
          const id = `cs_test_new${++stripeState.seq}`;
          return { id, url: `https://checkout.stripe.com/c/pay/${id}`, status: "open", livemode: false };
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
    getAppUrl: () => "http://localhost:3000",
  };
});

import { StripeConfigError } from "@/lib/stripe";
import { AuthError } from "@/modules/auth/services/auth-errors";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { connectedAccounts } from "@/modules/payments/schema/connected-accounts.table";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { projects } from "@/modules/projects/schema/projects.table";
import { closeProject } from "@/modules/projects/services/project.service";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";
import { cancelPendingPayment } from "./payment-cancellation.service";
import { createCheckoutForProject, RESUME_WINDOW_SECONDS } from "./payment-checkout.service";
import { handleStripeEvent } from "./payment-event.service";
import { PaymentError } from "./payment-errors";
import { cancelPendingAttemptWithoutSession } from "./payment-transitions";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;
let client: AuthUser;
let otherClient: AuthUser;
let developer: AuthUser;
let admin: AuthUser;
const PRICE = 150_000;

async function seedUser(role: AuthUser["role"]): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_c_${n}`, role, displayName: `C${n}`, email: `c${n}@example.com` })
    .returning();
  return { id: row.id, clerkUserId: row.clerkUserId, role, displayName: row.displayName, email: row.email };
}

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  client = await seedUser("client");
  otherClient = await seedUser("client");
  developer = await seedUser("developer");
  admin = await seedUser("admin");
});
afterAll(async () => {
  await ctx.client.close();
});
beforeEach(() => {
  stripeState.sessions.clear();
  stripeState.expireCalls.length = 0;
  stripeState.retrieveCalls.length = 0;
  stripeState.createCalls = 0;
  stripeState.expireError = null;
  stripeState.retrieveError = null;
  stripeState.configError = null;
  stripeState.onExpire = undefined;
  holder.db = ctx.db;
  transferMock.run.mockReset();
  transferMock.run.mockResolvedValue(undefined);
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

type Seeded = { projectId: string; attemptId: string; proposalId: string; sessionId: string };
type SeedOpts = {
  attempt?: "pending" | "canceled" | "failed" | "completed_test" | "none";
  withSession?: boolean;
  ageSeconds?: number;
};

async function seed(opts: SeedOpts = {}): Promise<Seeded> {
  const n = ++seq;
  const [project] = await ctx.db
    .insert(projects)
    .values({
      clientId: client.id,
      title: "Landing page",
      category: "Frontend & UI/UX",
      description: "We need a modern landing page for our bakery.",
      budgetMinCents: 100_000,
      budgetMaxCents: 200_000,
      timelineWeeks: 4,
      status: "proposal_selected",
      publishedAt: new Date(),
    })
    .returning();
  const [dev] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_cd_${n}`, role: "developer", displayName: `D${n}`, email: `cd${n}@example.com` })
    .returning();
  await ctx.db.insert(connectedAccounts).values({
    userId: dev.id,
    stripeAccountId: `acct_test_c${n}`,
    status: "active",
  });
  const [proposal] = await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: dev.id, priceCents: PRICE, timelineWeeks: 3, description: "d", status: "accepted" })
    .returning();
  await ctx.db.insert(proposalSelections).values({ projectId: project.id, proposalId: proposal.id, selectedBy: client.id });
  const sessionId = `cs_test_c${n}`;
  let attemptId = "";
  if (opts.attempt !== "none") {
    const status = opts.attempt ?? "pending";
    const [attempt] = await ctx.db
      .insert(paymentAttempts)
      .values({
        projectId: project.id,
        proposalId: proposal.id,
        clientId: client.id,
        amountCents: PRICE,
        currency: "USD",
        status,
        stripeCheckoutSessionId: opts.withSession === false ? null : sessionId,
        ...(status === "completed_test" ? { stripePaymentIntentId: `pi_c${n}`, completedAt: new Date() } : {}),
        ...(opts.ageSeconds ? { createdAt: new Date(Date.now() - opts.ageSeconds * 1000) } : {}),
      })
      .returning();
    attemptId = attempt.id;
  }
  return { projectId: project.id, attemptId, proposalId: proposal.id, sessionId };
}

function setSession(s: Seeded, over: Record<string, unknown> = {}) {
  const session = {
    id: s.sessionId,
    livemode: false,
    status: "open",
    payment_status: "unpaid",
    amount_total: PRICE,
    currency: "usd",
    payment_intent: `pi_c_${s.sessionId}`,
    client_reference_id: s.attemptId,
    metadata: { payment_attempt_id: s.attemptId, project_id: s.projectId, proposal_id: s.proposalId, client_id: client.id },
    ...over,
  };
  stripeState.sessions.set(s.sessionId, session);
  return session;
}

const attemptRow = async (id: string) =>
  (await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, id)))[0];
const projectRow = async (id: string) =>
  (await ctx.db.select().from(projects).where(eq(projects.id, id)))[0];
const transferRows = (attemptId: string) =>
  ctx.db.select().from(developerTransfers).where(eq(developerTransfers.paymentAttemptId, attemptId));
const stripeCalls = () => stripeState.expireCalls.length + stripeState.retrieveCalls.length;
const eventOf = (type: string, session: Record<string, unknown>, id: string) =>
  ({ id, type, livemode: false, data: { object: session } }) as unknown as Stripe.Event;

describe("cancelPendingPayment: open session (AC3)", () => {
  it("expires the session, cancels the attempt and leaves the project and transfers untouched", async () => {
    const s = await seed();
    setSession(s);
    expect(await cancelPendingPayment(client, s.projectId)).toEqual({ outcome: "canceled" });
    expect(stripeState.expireCalls).toEqual([s.sessionId]);
    expect(stripeState.createCalls).toBe(0);
    expect((await attemptRow(s.attemptId)).status).toBe("canceled");
    expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
    expect(await transferRows(s.attemptId)).toHaveLength(0);
    expect(transferMock.run).not.toHaveBeenCalled();
  });

  it("reference mismatch -> PAYMENT_NOT_CANCELABLE without changes", async () => {
    const s = await seed();
    setSession(s, { client_reference_id: "other" });
    await expect(cancelPendingPayment(client, s.projectId)).rejects.toMatchObject({
      code: "PAYMENT_NOT_CANCELABLE",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });
});

describe("cancelPendingPayment: race, payment wins (AC4)", () => {
  it("expire rejects and the session is complete/paid -> completed, never canceled", async () => {
    const s = await seed();
    setSession(s, { status: "complete", payment_status: "paid" });
    stripeState.expireError = Object.assign(new Error("already complete"), { type: "StripeInvalidRequestError" });
    expect(await cancelPendingPayment(client, s.projectId)).toEqual({ outcome: "completed" });
    expect((await attemptRow(s.attemptId)).status).toBe("completed_test");
    expect((await projectRow(s.projectId)).status).toBe("contracted");
    expect(await transferRows(s.attemptId)).toHaveLength(1);
    expect(transferMock.run).toHaveBeenCalledWith(s.attemptId);
  });
});

describe("cancelPendingPayment: webhook got ahead (AC5)", () => {
  it("attempt already canceled by checkout.session.expired -> canceled, nothing else written", async () => {
    const s = await seed();
    const session = setSession(s);
    stripeState.onExpire = async () => {
      await handleStripeEvent(eventOf("checkout.session.expired", { ...session, status: "expired" }, "evt_cx_1"));
    };
    expect(await cancelPendingPayment(client, s.projectId)).toEqual({ outcome: "canceled" });
    expect((await attemptRow(s.attemptId)).status).toBe("canceled");
    expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
  });

  it("attempt already completed_test when the result is applied -> completed, no cancel", async () => {
    const s = await seed();
    const session = setSession(s);
    stripeState.onExpire = async () => {
      await handleStripeEvent(
        eventOf("checkout.session.completed", { ...session, status: "complete", payment_status: "paid" }, "evt_cx_2"),
      );
    };
    expect(await cancelPendingPayment(client, s.projectId)).toEqual({ outcome: "completed" });
    expect((await attemptRow(s.attemptId)).status).toBe("completed_test");
    expect((await projectRow(s.projectId)).status).toBe("contracted");
  });
});

describe("cancelPendingPayment: expire fails (AC6)", () => {
  const failExpire = () => {
    stripeState.expireError = Object.assign(new Error("boom"), { type: "StripeInvalidRequestError" });
  };

  it("re-read says expired -> canceled", async () => {
    const s = await seed();
    setSession(s, { status: "expired", payment_status: "unpaid" });
    failExpire();
    expect(await cancelPendingPayment(client, s.projectId)).toEqual({ outcome: "canceled" });
    expect((await attemptRow(s.attemptId)).status).toBe("canceled");
    expect(stripeState.retrieveCalls).toEqual([s.sessionId]);
  });

  it.each([
    ["open", { status: "open", payment_status: "unpaid" }],
    ["complete without paid", { status: "complete", payment_status: "unpaid" }],
  ])("re-read says %s -> PAYMENT_NOT_CANCELABLE and the attempt stays pending", async (_n, over) => {
    const s = await seed();
    setSession(s, over);
    failExpire();
    const err = await cancelPendingPayment(client, s.projectId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect((err as PaymentError).code).toBe("PAYMENT_NOT_CANCELABLE");
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("re-read throws -> STRIPE_UNAVAILABLE without changes", async () => {
    const s = await seed();
    setSession(s);
    failExpire();
    stripeState.retrieveError = Object.assign(new Error("net"), { type: "StripeConnectionError" });
    await expect(cancelPendingPayment(client, s.projectId)).rejects.toMatchObject({ code: "STRIPE_UNAVAILABLE" });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("never logs the Stripe message of non invalid-request errors nor secrets", async () => {
    const s = await seed();
    setSession(s);
    stripeState.expireError = Object.assign(new Error("sk_live_x acct_123 https://x.test"), {
      type: "StripeConnectionError",
    });
    await cancelPendingPayment(client, s.projectId).catch(() => null);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/sk_live|acct_|https?:/);
  });
});

describe("cancelPendingPayment: attempt without session (AC7)", () => {
  it("older than the resume window -> canceled without calling Stripe", async () => {
    const s = await seed({ withSession: false, ageSeconds: RESUME_WINDOW_SECONDS + 60 });
    expect(await cancelPendingPayment(client, s.projectId)).toEqual({ outcome: "canceled" });
    expect((await attemptRow(s.attemptId)).status).toBe("canceled");
    expect(stripeCalls()).toBe(0);
  });

  it("newer than the window -> PAYMENT_NOT_CANCELABLE without changes", async () => {
    const s = await seed({ withSession: false, ageSeconds: 30 });
    await expect(cancelPendingPayment(client, s.projectId)).rejects.toMatchObject({
      code: "PAYMENT_NOT_CANCELABLE",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
    expect(stripeCalls()).toBe(0);
  });

  it("a session stored between the read and the UPDATE is never canceled without Stripe", async () => {
    const s = await seed({ withSession: false, ageSeconds: RESUME_WINDOW_SECONDS + 60 });
    setSession(s);
    const real = ctx.db;
    holder.db = new Proxy(real, {
      get(target, prop) {
        if (prop === "transaction") {
          return async (fn: never) => {
            // Another request (checkout phase C) stores the session id right before our UPDATE.
            await real
              .update(paymentAttempts)
              .set({ stripeCheckoutSessionId: s.sessionId })
              .where(eq(paymentAttempts.id, s.attemptId));
            holder.db = real;
            return (real.transaction as (f: never) => Promise<unknown>).call(real, fn);
          };
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    // The guard IS NULL blocks the local cancel; the re-analysis goes through Stripe.
    expect(await cancelPendingPayment(client, s.projectId)).toEqual({ outcome: "canceled" });
    expect(stripeState.expireCalls).toEqual([s.sessionId]);
  });

  it("leaf: only cancels a pending attempt without session (AC2)", async () => {
    const withSession = await seed();
    const noSession = await seed({ withSession: false });
    const done = await seed({ attempt: "canceled", withSession: false });
    expect(await cancelPendingAttemptWithoutSession(ctx.db, withSession.attemptId)).toBe(false);
    expect((await attemptRow(withSession.attemptId)).status).toBe("pending");
    expect(await cancelPendingAttemptWithoutSession(ctx.db, done.attemptId)).toBe(false);
    expect(await cancelPendingAttemptWithoutSession(ctx.db, noSession.attemptId)).toBe(true);
    expect((await attemptRow(noSession.attemptId)).status).toBe("canceled");
  });
});

describe("cancelPendingPayment: idempotency (AC8)", () => {
  it.each([["none"], ["failed"], ["canceled"]] as const)("%s -> none without Stripe", async (attempt) => {
    const s = await seed({ attempt });
    expect(await cancelPendingPayment(client, s.projectId)).toEqual({ outcome: "none" });
    expect(stripeCalls()).toBe(0);
  });

  it("completed_test -> completed without changes or Stripe", async () => {
    const s = await seed({ attempt: "completed_test" });
    expect(await cancelPendingPayment(client, s.projectId)).toEqual({ outcome: "completed" });
    expect((await attemptRow(s.attemptId)).status).toBe("completed_test");
    expect(stripeCalls()).toBe(0);
  });

  it("a second cancellation after the first returns none", async () => {
    const s = await seed();
    setSession(s);
    expect(await cancelPendingPayment(client, s.projectId)).toEqual({ outcome: "canceled" });
    expect(await cancelPendingPayment(client, s.projectId)).toEqual({ outcome: "none" });
    expect(stripeState.expireCalls).toHaveLength(1);
  });

  it("two simultaneous cancellations end coherent with no untranslated error", async () => {
    const s = await seed();
    setSession(s);
    const results = await Promise.allSettled([
      cancelPendingPayment(client, s.projectId),
      cancelPendingPayment(client, s.projectId),
    ]);
    for (const r of results) {
      if (r.status === "fulfilled") expect(["canceled", "none"]).toContain(r.value.outcome);
      else expect(r.reason).toBeInstanceOf(PaymentError);
    }
    expect((await attemptRow(s.attemptId)).status).toBe("canceled");
  });
});

describe("cancelPendingPayment: permissions and configuration (AC9)", () => {
  it("developer and admin -> FORBIDDEN before DB and Stripe", async () => {
    const s = await seed();
    setSession(s);
    for (const actor of [developer, admin]) {
      await expect(cancelPendingPayment(actor, s.projectId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(stripeCalls()).toBe(0);
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("foreign or unknown project -> NOT_FOUND without Stripe", async () => {
    const s = await seed();
    setSession(s);
    await expect(cancelPendingPayment(otherClient, s.projectId)).rejects.toBeInstanceOf(AuthError);
    await expect(cancelPendingPayment(otherClient, s.projectId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      cancelPendingPayment(client, "11111111-1111-4111-8111-111111111111"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(stripeCalls()).toBe(0);
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("StripeConfigError -> STRIPE_NOT_CONFIGURED without writing", async () => {
    const s = await seed();
    stripeState.configError = new StripeConfigError("sk_live_ rejected");
    const err = await cancelPendingPayment(client, s.projectId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect((err as PaymentError).code).toBe("STRIPE_NOT_CONFIGURED");
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("livemode response -> STRIPE_NOT_CONFIGURED without changes", async () => {
    const s = await seed();
    setSession(s, { livemode: true });
    await expect(cancelPendingPayment(client, s.projectId)).rejects.toMatchObject({
      code: "STRIPE_NOT_CONFIGURED",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });
});

describe("after canceling (AC11)", () => {
  it("closeProject no longer answers PAYMENT_IN_PROGRESS", async () => {
    const s = await seed();
    setSession(s);
    await expect(closeProject(client, s.projectId)).rejects.toMatchObject({ code: "PAYMENT_IN_PROGRESS" });
    await cancelPendingPayment(client, s.projectId);
    const closed = await closeProject(client, s.projectId);
    expect(closed.status).toBe("closed");
  });

  it("createCheckoutForProject creates a new attempt", async () => {
    const s = await seed();
    setSession(s);
    await cancelPendingPayment(client, s.projectId);
    const result = await createCheckoutForProject(client, s.projectId);
    expect(result.attemptId).not.toBe(s.attemptId);
    expect((await attemptRow(s.attemptId)).status).toBe("canceled");
    expect((await attemptRow(result.attemptId)).status).toBe("pending");
  });
});
