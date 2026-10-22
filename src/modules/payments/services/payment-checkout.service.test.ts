// @vitest-environment node
// NOTE: PGlite is single-connection and serializes transactions, so the Promise.allSettled test below
// proves that the final state is coherent in any execution order. It does NOT demonstrate the real
// FOR UPDATE behavior under true concurrency (Neon/Postgres); that is validated by reading the SQL.
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

type FakeSession = {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired" | null;
  livemode: boolean;
};
type CreateCall = { params: Record<string, unknown>; options: { idempotencyKey: string } };

const stripeState = vi.hoisted(() => ({
  sessions: new Map<string, FakeSession>(),
  byKey: new Map<string, FakeSession>(),
  createCalls: [] as unknown[],
  retrieveCalls: [] as string[],
  createError: null as unknown,
  retrieveError: null as unknown,
  onCreate: undefined as undefined | (() => Promise<void>),
  createOverride: undefined as undefined | Record<string, unknown>,
  configError: null as unknown,
  seq: 0,
}));

vi.mock("@/lib/stripe", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/stripe")>();
  const client = {
    checkout: {
      sessions: {
        create: async (params: unknown, options: { idempotencyKey: string }) => {
          stripeState.createCalls.push({ params, options });
          if (stripeState.onCreate) await stripeState.onCreate();
          if (stripeState.createError) throw stripeState.createError;
          const known = stripeState.byKey.get(options.idempotencyKey);
          if (known) return known;
          const n = ++stripeState.seq;
          const session = {
            id: `cs_test_${n}`,
            url: `https://checkout.stripe.com/c/pay/cs_test_${n}`,
            status: "open",
            livemode: false,
            ...stripeState.createOverride,
          } as FakeSession;
          stripeState.sessions.set(session.id, session);
          stripeState.byKey.set(options.idempotencyKey, session);
          return session;
        },
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
    getAppUrl: () => "http://localhost:3000",
  };
});

import { StripeConfigError } from "@/lib/stripe";
import { AuthError } from "@/modules/auth/services/auth-errors";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { connectedAccounts } from "@/modules/payments/schema/connected-accounts.table";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { projects } from "@/modules/projects/schema/projects.table";
import { closeProject } from "@/modules/projects/services/project.service";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";
import {
  CHECKOUT_SESSION_TTL_SECONDS,
  createCheckoutForProject,
  RESUME_WINDOW_SECONDS,
} from "./payment-checkout.service";
import { PaymentError } from "./payment-errors";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;

let client: AuthUser;
let otherClient: AuthUser;
let developer: AuthUser;
let admin: AuthUser;

const ACCEPTED_PRICE = 150_000;
const PROJECT_TITLE = "Landing page for our bakery";

async function seedUser(role: AuthUser["role"]): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_p_${n}`, role, displayName: `User ${n}`, email: `p${n}@example.com` })
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
  stripeState.byKey.clear();
  stripeState.createCalls.length = 0;
  stripeState.retrieveCalls.length = 0;
  stripeState.createError = null;
  stripeState.retrieveError = null;
  stripeState.onCreate = undefined;
  stripeState.createOverride = undefined;
  stripeState.configError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  holder.db = ctx.db;
});
afterEach(async () => {
  vi.restoreAllMocks();
  // AC15: spec 009 never writes completed_test nor a payment intent id, and never moves the project.
  const rows = await ctx.db.select().from(paymentAttempts);
  for (const row of rows) {
    if (row.status === "completed_test") continue; // seeded explicitly by one test
    expect(row.stripePaymentIntentId).toBeNull();
    expect(row.livemode).toBe(false);
  }
});

async function seedProject(status: ProjectStatus = "proposal_selected", owner: AuthUser = client) {
  const [row] = await ctx.db
    .insert(projects)
    .values({
      clientId: owner.id,
      title: PROJECT_TITLE,
      category: "Frontend & UI/UX",
      description: "We need a modern landing page for our bakery.",
      budgetMinCents: 100_000,
      budgetMaxCents: 200_000,
      timelineWeeks: 4,
      status,
      publishedAt: status === "draft" ? null : new Date(),
      closedAt: status === "closed" ? new Date() : null,
    })
    .returning();
  return row;
}

/** Project in proposal_selected with an accepted proposal (+ a rejected one with another price). */
async function seedSelected(over: { withWinner?: boolean; payouts?: "active" | "pending" | "none" } = {}) {
  const project = await seedProject("proposal_selected");
  if (over.withWinner === false) return { project, accepted: null };
  const dev = await seedUser("developer");
  const other = await seedUser("developer");
  const payouts = over.payouts ?? "active";
  if (payouts !== "none") {
    await ctx.db.insert(connectedAccounts).values({
      userId: dev.id,
      stripeAccountId: `acct_test_${dev.id.slice(0, 8)}`,
      status: payouts,
    });
  }
  const [accepted] = await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: dev.id, priceCents: ACCEPTED_PRICE, timelineWeeks: 3, description: "d", status: "accepted" })
    .returning();
  await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: other.id, priceCents: 999_999, timelineWeeks: 2, description: "d", status: "rejected" });
  await ctx.db
    .insert(proposalSelections)
    .values({ projectId: project.id, proposalId: accepted.id, selectedBy: client.id });
  return { project, accepted };
}

const attemptsOf = (projectId: string) =>
  ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.projectId, projectId));
const projectRow = async (id: string) =>
  (await ctx.db.select().from(projects).where(eq(projects.id, id)))[0];

async function rejectsWith(p: Promise<unknown>, code: string, cls: typeof PaymentError | typeof AuthError) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(cls);
  expect((err as { code: string }).code).toBe(code);
}

const stripeError = (type: string) => Object.assign(new Error("boom"), { type, statusCode: 500 });
const createCalls = () => stripeState.createCalls as CreateCall[];

describe("createCheckoutForProject: happy path", () => {
  it("creates one pending attempt with the amount of the accepted proposal and stores the session id", async () => {
    const { project, accepted } = await seedSelected();
    const result = await createCheckoutForProject(client, project.id);

    const rows = await attemptsOf(project.id);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(result).toEqual({
      attemptId: row.id,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_" + stripeState.seq,
      reused: false,
    });
    expect(row).toMatchObject({
      status: "pending",
      projectId: project.id,
      proposalId: accepted!.id,
      clientId: client.id,
      amountCents: ACCEPTED_PRICE,
      currency: "USD",
      livemode: false,
      stripePaymentIntentId: null,
      completedAt: null,
      stripeCheckoutSessionId: `cs_test_${stripeState.seq}`,
    });
    expect((await projectRow(project.id)).status).toBe("proposal_selected");
  });

  it("takes no amount, currency or proposal from the input (I2)", () => {
    expect(createCheckoutForProject.length).toBe(2);
  });

  it("sends exact params, metadata without PII and a per-attempt idempotency key", async () => {
    const { project, accepted } = await seedSelected();
    const { attemptId } = await createCheckoutForProject(client, project.id);
    const [row] = await attemptsOf(project.id);

    expect(createCalls()).toHaveLength(1);
    const { params, options } = createCalls()[0];
    expect(options).toEqual({ idempotencyKey: `nexora:checkout:${attemptId}` });
    const ids = {
      payment_attempt_id: attemptId,
      project_id: project.id,
      proposal_id: accepted!.id,
      client_id: client.id,
    };
    expect(params).toEqual({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: ACCEPTED_PRICE,
            product_data: { name: PROJECT_TITLE },
          },
        },
      ],
      client_reference_id: attemptId,
      metadata: ids,
      payment_intent_data: { metadata: ids },
      success_url: `http://localhost:3000/projects/${project.id}/payment?checkout=success`,
      cancel_url: `http://localhost:3000/projects/${project.id}/payment?checkout=cancel`,
      expires_at: Math.floor(row.createdAt.getTime() / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
    });
    const meta = JSON.stringify([params.metadata, params.payment_intent_data]);
    expect(meta).not.toContain(client.email);
    expect(meta).not.toContain(PROJECT_TITLE);
    expect(Number.isInteger((params.line_items as { price_data: { unit_amount: number } }[])[0].price_data.unit_amount)).toBe(true);
  });

  it("truncates the product name to 80 characters", async () => {
    const { project } = await seedSelected();
    await ctx.db.update(projects).set({ title: "x".repeat(120) }).where(eq(projects.id, project.id));
    await createCheckoutForProject(client, project.id);
    const items = createCalls()[0].params.line_items as { price_data: { product_data: { name: string } } }[];
    expect(items[0].price_data.product_data.name).toHaveLength(80);
  });

  it("inserts the attempt before calling Stripe (AC7)", async () => {
    const { project } = await seedSelected();
    let seen: Awaited<ReturnType<typeof attemptsOf>> = [];
    stripeState.onCreate = async () => {
      seen = await attemptsOf(project.id);
    };
    await createCheckoutForProject(client, project.id);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ status: "pending", stripeCheckoutSessionId: null });
  });
});

describe("createCheckoutForProject: eligibility and authorization", () => {
  it.each(["draft", "published", "contracted", "closed"] as const)(
    "rejects a %s project with PAYMENT_NOT_ALLOWED",
    async (status) => {
      const project = await seedProject(status);
      await rejectsWith(createCheckoutForProject(client, project.id), "PAYMENT_NOT_ALLOWED", PaymentError);
      expect(await attemptsOf(project.id)).toHaveLength(0);
      expect(stripeState.createCalls).toHaveLength(0);
    },
  );

  it("rejects proposal_selected without an accepted proposal", async () => {
    const { project } = await seedSelected({ withWinner: false });
    await rejectsWith(createCheckoutForProject(client, project.id), "PAYMENT_NOT_ALLOWED", PaymentError);
    expect(await attemptsOf(project.id)).toHaveLength(0);
    expect(stripeState.createCalls).toHaveLength(0);
  });

  it.each(["none", "pending"] as const)(
    "rejects with DEVELOPER_PAYOUTS_NOT_READY when the winner payouts are %s",
    async (payouts) => {
      const { project } = await seedSelected({ payouts });
      await rejectsWith(createCheckoutForProject(client, project.id), "DEVELOPER_PAYOUTS_NOT_READY", PaymentError);
      expect(await attemptsOf(project.id)).toHaveLength(0);
      expect(stripeState.createCalls).toHaveLength(0);
    },
  );

  it.each([["developer"], ["admin"]] as const)("%s gets FORBIDDEN without touching DB or Stripe", async (who) => {
    const actor = who === "developer" ? developer : admin;
    const project = await seedProject("proposal_selected", actor); // even as seeded owner
    // If the Stripe boundary were touched before the permission check, this error would surface instead.
    stripeState.configError = new Error("Stripe boundary must not be touched");
    await rejectsWith(createCheckoutForProject(actor, project.id), "FORBIDDEN", AuthError);
    expect(await attemptsOf(project.id)).toHaveLength(0);
    expect(stripeState.createCalls).toHaveLength(0);
  });

  it("foreign client and unknown project get NOT_FOUND", async () => {
    const { project } = await seedSelected();
    await rejectsWith(createCheckoutForProject(otherClient, project.id), "NOT_FOUND", AuthError);
    await rejectsWith(
      createCheckoutForProject(client, "00000000-0000-4000-8000-000000000000"),
      "NOT_FOUND",
      AuthError,
    );
    expect(await attemptsOf(project.id)).toHaveLength(0);
    expect(stripeState.createCalls).toHaveLength(0);
  });

  it("admin who is not the owner gets FORBIDDEN (D8)", async () => {
    const { project } = await seedSelected();
    await rejectsWith(createCheckoutForProject(admin, project.id), "FORBIDDEN", AuthError);
  });

  it("rejects when a completed_test attempt already exists (defense)", async () => {
    const { project, accepted } = await seedSelected();
    await ctx.db.insert(paymentAttempts).values({
      projectId: project.id,
      proposalId: accepted!.id,
      clientId: client.id,
      amountCents: ACCEPTED_PRICE,
      status: "completed_test",
      completedAt: new Date(),
    });
    await rejectsWith(createCheckoutForProject(client, project.id), "PAYMENT_ALREADY_ACTIVE", PaymentError);
    expect(stripeState.createCalls).toHaveLength(0);
  });
});

describe("createCheckoutForProject: one active attempt and reuse", () => {
  it("reuses the open session on retry: same URL, no new row, no new session", async () => {
    const { project } = await seedSelected();
    const first = await createCheckoutForProject(client, project.id);
    const second = await createCheckoutForProject(client, project.id);

    expect(second).toEqual({ ...first, reused: true });
    expect(stripeState.createCalls).toHaveLength(1);
    expect(stripeState.retrieveCalls).toHaveLength(1);
    expect(await attemptsOf(project.id)).toHaveLength(1);
  });

  it("two simultaneous calls leave exactly one active row and never an untranslated DB error", async () => {
    const { project } = await seedSelected();
    const results = await Promise.allSettled([
      createCheckoutForProject(client, project.id),
      createCheckoutForProject(client, project.id),
    ]);
    for (const r of results) {
      if (r.status === "rejected") {
        expect(r.reason).toBeInstanceOf(PaymentError);
        expect(["STRIPE_UNAVAILABLE", "PAYMENT_ALREADY_ACTIVE"]).toContain(r.reason.code);
      }
    }
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const active = (await attemptsOf(project.id)).filter((a) => a.status === "pending");
    expect(active).toHaveLength(1);
    expect(new Set(createCalls().map((c) => c.options.idempotencyKey)).size).toBe(1);
  });

  it("the partial unique index rejects a second pending attempt (safety net)", async () => {
    const { project, accepted } = await seedSelected();
    await createCheckoutForProject(client, project.id);
    await expect(
      ctx.db.insert(paymentAttempts).values({
        projectId: project.id,
        proposalId: accepted!.id,
        clientId: client.id,
        amountCents: ACCEPTED_PRICE,
        status: "pending",
      }),
    ).rejects.toThrow();
  });

  it("answers PAYMENT_ALREADY_ACTIVE when the index fires inside the service", async () => {
    const { project, accepted } = await seedSelected();
    await ctx.db.insert(paymentAttempts).values({
      projectId: project.id,
      proposalId: accepted!.id,
      clientId: client.id,
      amountCents: ACCEPTED_PRICE,
      status: "pending",
    });
    // Make the "active attempt" lookup miss the row, as if the lock had been bypassed.
    const real = ctx.db;
    holder.db = new Proxy(real, {
      get(target, prop) {
        if (prop !== "transaction") return Reflect.get(target, prop);
        return (cb: (tx: unknown) => Promise<unknown>) =>
          target.transaction((tx) =>
            cb(
              new Proxy(tx, {
                get(t, p) {
                  const value = Reflect.get(t, p) as unknown;
                  if (p !== "select") return typeof value === "function" ? value.bind(t) : value;
                  return (fields: Record<string, unknown>) =>
                    fields && "stripeCheckoutSessionId" in fields
                      ? { from: () => ({ where: () => ({ limit: async () => [] }) }) }
                      : (value as (f: unknown) => unknown).call(t, fields);
                },
              }),
            ),
          );
      },
    });
    await rejectsWith(createCheckoutForProject(client, project.id), "PAYMENT_ALREADY_ACTIVE", PaymentError);
    expect(stripeState.createCalls).toHaveLength(0);
    expect(await attemptsOf(project.id)).toHaveLength(1);
  });

  it("closeProject answers PAYMENT_IN_PROGRESS once the attempt exists (regression)", async () => {
    const { project } = await seedSelected();
    await createCheckoutForProject(client, project.id);
    await expect(closeProject(client, project.id)).rejects.toMatchObject({ code: "PAYMENT_IN_PROGRESS" });
  });
});

describe("createCheckoutForProject: existing session states", () => {
  it("complete session: PAYMENT_ALREADY_ACTIVE and the attempt stays pending", async () => {
    const { project } = await seedSelected();
    await createCheckoutForProject(client, project.id);
    stripeState.sessions.get("cs_test_" + stripeState.seq)!.status = "complete";
    await rejectsWith(createCheckoutForProject(client, project.id), "PAYMENT_ALREADY_ACTIVE", PaymentError);
    const rows = await attemptsOf(project.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("expired session: cancels the old attempt and creates a new one (D-E)", async () => {
    const { project } = await seedSelected();
    const first = await createCheckoutForProject(client, project.id);
    stripeState.sessions.get("cs_test_" + stripeState.seq)!.status = "expired";

    const second = await createCheckoutForProject(client, project.id);
    expect(second.attemptId).not.toBe(first.attemptId);
    expect(second.reused).toBe(false);
    const rows = await attemptsOf(project.id);
    expect(rows.find((r) => r.id === first.attemptId)!.status).toBe("canceled");
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(1);
    expect(stripeState.createCalls).toHaveLength(2);
  });

  it("failure reading the session: STRIPE_UNAVAILABLE and no state change", async () => {
    const { project } = await seedSelected();
    await createCheckoutForProject(client, project.id);
    stripeState.retrieveError = stripeError("StripeConnectionError");
    await rejectsWith(createCheckoutForProject(client, project.id), "STRIPE_UNAVAILABLE", PaymentError);
    expect((await attemptsOf(project.id))[0].status).toBe("pending");
  });

  it("open session without url or null status is not reusable and changes nothing", async () => {
    const { project } = await seedSelected();
    await createCheckoutForProject(client, project.id);
    const session = stripeState.sessions.get("cs_test_" + stripeState.seq)!;
    session.url = null;
    await rejectsWith(createCheckoutForProject(client, project.id), "STRIPE_UNAVAILABLE", PaymentError);
    session.url = "https://checkout.stripe.com/x";
    session.status = null;
    await rejectsWith(createCheckoutForProject(client, project.id), "STRIPE_UNAVAILABLE", PaymentError);
    expect((await attemptsOf(project.id))[0].status).toBe("pending");
    expect(stripeState.createCalls).toHaveLength(1);
  });

  it("a live session on retrieve is an error and no URL is returned", async () => {
    const { project } = await seedSelected();
    await createCheckoutForProject(client, project.id);
    stripeState.sessions.get("cs_test_" + stripeState.seq)!.livemode = true;
    await rejectsWith(createCheckoutForProject(client, project.id), "STRIPE_NOT_CONFIGURED", PaymentError);
  });
});

describe("createCheckoutForProject: Stripe failures (D-D)", () => {
  it.each(["StripeInvalidRequestError", "StripeAuthenticationError", "StripePermissionError"])(
    "definitive rejection %s cancels the attempt and a new attempt works right away",
    async (type) => {
      const { project } = await seedSelected();
      stripeState.createError = stripeError(type);
      await rejectsWith(createCheckoutForProject(client, project.id), "STRIPE_UNAVAILABLE", PaymentError);
      let rows = await attemptsOf(project.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "canceled", stripeCheckoutSessionId: null });

      stripeState.createError = null;
      const ok = await createCheckoutForProject(client, project.id);
      expect(ok.reused).toBe(false);
      rows = await attemptsOf(project.id);
      expect(rows.filter((r) => r.status === "pending")).toHaveLength(1);
    },
  );

  it.each([
    "StripeConnectionError",
    "StripeAPIError",
    "StripeRateLimitError",
    "StripeIdempotencyError",
    "SomethingElse",
  ])("ambiguous failure %s keeps the attempt pending and resumable with the same key and params", async (type) => {
    const { project } = await seedSelected();
    stripeState.createError = stripeError(type);
    await rejectsWith(createCheckoutForProject(client, project.id), "STRIPE_UNAVAILABLE", PaymentError);
    let rows = await attemptsOf(project.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", stripeCheckoutSessionId: null });

    stripeState.createError = null;
    const resumed = await createCheckoutForProject(client, project.id);
    expect(resumed.attemptId).toBe(rows[0].id);
    expect(resumed.reused).toBe(true);
    const [first, second] = createCalls();
    expect(second.options.idempotencyKey).toBe(first.options.idempotencyKey);
    expect(second.params).toEqual(first.params);
    rows = await attemptsOf(project.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].stripeCheckoutSessionId).toBe(`cs_test_${stripeState.seq}`);
  });

  it("past the resume window the old attempt is canceled and a new one is created", async () => {
    const { project } = await seedSelected();
    stripeState.createError = stripeError("StripeConnectionError");
    await rejectsWith(createCheckoutForProject(client, project.id), "STRIPE_UNAVAILABLE", PaymentError);
    const [old] = await attemptsOf(project.id);
    await ctx.db
      .update(paymentAttempts)
      .set({ createdAt: new Date(Date.now() - (RESUME_WINDOW_SECONDS + 60) * 1000) })
      .where(eq(paymentAttempts.id, old.id));

    stripeState.createError = null;
    const result = await createCheckoutForProject(client, project.id);
    expect(result.attemptId).not.toBe(old.id);
    const rows = await attemptsOf(project.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === old.id)!.status).toBe("canceled");
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(1);
  });

  it("a live Stripe response cancels the attempt and returns STRIPE_NOT_CONFIGURED", async () => {
    const { project } = await seedSelected();
    stripeState.createOverride = { livemode: true };
    await rejectsWith(createCheckoutForProject(client, project.id), "STRIPE_NOT_CONFIGURED", PaymentError);
    expect((await attemptsOf(project.id))[0]).toMatchObject({ status: "canceled", stripeCheckoutSessionId: null });
  });

  it.each([
    ["missing", null],
    ["http", "http://checkout.stripe.com/c/pay/x"],
    ["foreign host", "https://evil.example.com/pay"],
    ["not a url", "nope"],
  ])("a session url that is %s cancels the attempt (STRIPE_UNAVAILABLE)", async (_label, url) => {
    const { project } = await seedSelected();
    stripeState.createOverride = { url };
    await rejectsWith(createCheckoutForProject(client, project.id), "STRIPE_UNAVAILABLE", PaymentError);
    expect((await attemptsOf(project.id))[0]).toMatchObject({ status: "canceled", stripeCheckoutSessionId: null });
  });

  it("does not store the session id when the attempt changed meanwhile (phase C)", async () => {
    const { project } = await seedSelected();
    stripeState.onCreate = async () => {
      await ctx.db.update(paymentAttempts).set({ status: "canceled" }).where(eq(paymentAttempts.projectId, project.id));
    };
    await rejectsWith(createCheckoutForProject(client, project.id), "PAYMENT_ALREADY_ACTIVE", PaymentError);
    expect((await attemptsOf(project.id))[0].stripeCheckoutSessionId).toBeNull();
  });
});

describe("createCheckoutForProject: Stripe configuration", () => {
  it("StripeConfigError (missing or live key, missing APP_URL) -> STRIPE_NOT_CONFIGURED, nothing written", async () => {
    const { project } = await seedSelected();
    stripeState.configError = new StripeConfigError("STRIPE_SECRET_KEY is a live key");
    await rejectsWith(createCheckoutForProject(client, project.id), "STRIPE_NOT_CONFIGURED", PaymentError);
    expect(await attemptsOf(project.id)).toHaveLength(0);
    expect(stripeState.createCalls).toHaveLength(0);
  });

  it("an unexpected error from the Stripe boundary is not swallowed", async () => {
    const { project } = await seedSelected();
    stripeState.configError = new TypeError("bug");
    await expect(createCheckoutForProject(client, project.id)).rejects.toThrow(TypeError);
  });
});
