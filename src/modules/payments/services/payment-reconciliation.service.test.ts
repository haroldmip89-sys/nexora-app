// @vitest-environment node
// NOTE: PGlite is single-connection and serializes transactions: the simultaneous case proves a
// coherent final state, not the real FOR UPDATE behavior under concurrency (validated by reading SQL).
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

const stripeState = vi.hoisted(() => ({
  sessions: new Map<string, Record<string, unknown>>(),
  retrieveCalls: [] as string[],
  retrieveError: null as unknown,
  configError: null as unknown,
}));
vi.mock("@/lib/stripe", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/stripe")>();
  const client = {
    checkout: {
      sessions: {
        retrieve: async (id: string) => {
          stripeState.retrieveCalls.push(id);
          if (stripeState.retrieveError) throw stripeState.retrieveError;
          return stripeState.sessions.get(id);
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
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { projects } from "@/modules/projects/schema/projects.table";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";
import { handleStripeEvent } from "./payment-event.service";
import { PaymentError } from "./payment-errors";
import { reconcileProjectPayment } from "./payment-reconciliation.service";

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
    .values({ clerkUserId: `clerk_r_${n}`, role, displayName: `R${n}`, email: `r${n}@example.com` })
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
  stripeState.retrieveCalls.length = 0;
  stripeState.retrieveError = null;
  stripeState.configError = null;
  holder.db = ctx.db;
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

type Seeded = { projectId: string; attemptId: string; proposalId: string; sessionId: string };

async function seed(opts: { attempt?: "pending" | "canceled" | "none"; withSession?: boolean } = {}): Promise<Seeded> {
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
    .values({ clerkUserId: `clerk_rd_${n}`, role: "developer", displayName: `D${n}`, email: `rd${n}@example.com` })
    .returning();
  const [proposal] = await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: dev.id, priceCents: PRICE, timelineWeeks: 3, description: "d", status: "accepted" })
    .returning();
  await ctx.db.insert(proposalSelections).values({ projectId: project.id, proposalId: proposal.id, selectedBy: client.id });
  const sessionId = `cs_test_r${n}`;
  let attemptId = "";
  if (opts.attempt !== "none") {
    const [attempt] = await ctx.db
      .insert(paymentAttempts)
      .values({
        projectId: project.id,
        proposalId: proposal.id,
        clientId: client.id,
        amountCents: PRICE,
        currency: "USD",
        status: opts.attempt ?? "pending",
        stripeCheckoutSessionId: opts.withSession === false ? null : sessionId,
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
    status: "complete",
    payment_status: "paid",
    amount_total: PRICE,
    currency: "usd",
    payment_intent: `pi_r_${s.sessionId}`,
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

describe("reconcileProjectPayment", () => {
  it("complete + paid -> completed (attempt completed_test, project contracted)", async () => {
    const s = await seed();
    setSession(s);
    expect(await reconcileProjectPayment(client, s.projectId)).toEqual({ outcome: "completed" });
    const attempt = await attemptRow(s.attemptId);
    expect(attempt.status).toBe("completed_test");
    expect(attempt.stripePaymentIntentId).toBe(`pi_r_${s.sessionId}`);
    expect((await projectRow(s.projectId)).status).toBe("contracted");
  });

  it("expired -> canceled, project unchanged", async () => {
    const s = await seed();
    setSession(s, { status: "expired", payment_status: "unpaid" });
    expect(await reconcileProjectPayment(client, s.projectId)).toEqual({ outcome: "canceled" });
    expect((await attemptRow(s.attemptId)).status).toBe("canceled");
    expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
  });

  it.each([
    ["open", { status: "open", payment_status: "unpaid" }],
    ["complete + unpaid", { status: "complete", payment_status: "unpaid" }],
  ])("%s -> unchanged without writing", async (_name, over) => {
    const s = await seed();
    setSession(s, over);
    expect(await reconcileProjectPayment(client, s.projectId)).toEqual({ outcome: "unchanged" });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
    expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
  });

  it("different amount -> unchanged", async () => {
    const s = await seed();
    setSession(s, { amount_total: PRICE + 5 });
    expect(await reconcileProjectPayment(client, s.projectId)).toEqual({ outcome: "unchanged" });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("no pending attempt with a session -> none, and Stripe is not called", async () => {
    const noAttempt = await seed({ attempt: "none" });
    const canceled = await seed({ attempt: "canceled" });
    const noSession = await seed({ withSession: false });
    for (const s of [noAttempt, canceled, noSession]) {
      expect(await reconcileProjectPayment(client, s.projectId)).toEqual({ outcome: "none" });
    }
    expect(stripeState.retrieveCalls).toHaveLength(0);
  });

  it("retrieve error -> STRIPE_UNAVAILABLE without changes", async () => {
    const s = await seed();
    stripeState.retrieveError = Object.assign(new Error("boom"), { type: "StripeConnectionError" });
    await expect(reconcileProjectPayment(client, s.projectId)).rejects.toMatchObject({
      code: "STRIPE_UNAVAILABLE",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("livemode session -> STRIPE_NOT_CONFIGURED without changes", async () => {
    const s = await seed();
    setSession(s, { livemode: true });
    await expect(reconcileProjectPayment(client, s.projectId)).rejects.toMatchObject({
      code: "STRIPE_NOT_CONFIGURED",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("StripeConfigError -> STRIPE_NOT_CONFIGURED", async () => {
    const s = await seed();
    stripeState.configError = new StripeConfigError("missing");
    const err = await reconcileProjectPayment(client, s.projectId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect((err as PaymentError).code).toBe("STRIPE_NOT_CONFIGURED");
  });

  it("developer and admin -> FORBIDDEN; foreign or unknown project -> NOT_FOUND", async () => {
    const s = await seed();
    setSession(s);
    for (const actor of [developer, admin]) {
      await expect(reconcileProjectPayment(actor, s.projectId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(reconcileProjectPayment(otherClient, s.projectId)).rejects.toBeInstanceOf(AuthError);
    await expect(reconcileProjectPayment(otherClient, s.projectId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      reconcileProjectPayment(client, "11111111-1111-4111-8111-111111111111"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(stripeState.retrieveCalls).toHaveLength(0);
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });
});

describe("reconciliation converges with the webhook (AC19)", () => {
  const completedEvent = (s: Seeded, session: Record<string, unknown>, id: string) =>
    ({ id, type: "checkout.session.completed", livemode: false, data: { object: session } }) as unknown as Stripe.Event;

  it("webhook then reconciliation -> none", async () => {
    const s = await seed();
    const session = setSession(s);
    await handleStripeEvent(completedEvent(s, session, "evt_conv_1"));
    expect(await reconcileProjectPayment(client, s.projectId)).toEqual({ outcome: "none" });
    expect((await projectRow(s.projectId)).status).toBe("contracted");
  });

  it("reconciliation then the event -> ignored attempt_not_pending", async () => {
    const s = await seed();
    const session = setSession(s);
    await reconcileProjectPayment(client, s.projectId);
    expect(await handleStripeEvent(completedEvent(s, session, "evt_conv_2"))).toEqual({
      result: "ignored",
      reason: "attempt_not_pending",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("completed_test");
  });

  it("both at once -> a single contracted, no untranslated error", async () => {
    const s = await seed();
    const session = setSession(s);
    const results = await Promise.allSettled([
      reconcileProjectPayment(client, s.projectId),
      handleStripeEvent(completedEvent(s, session, "evt_conv_3")),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect((await attemptRow(s.attemptId)).status).toBe("completed_test");
    expect((await projectRow(s.projectId)).status).toBe("contracted");
  });
});
