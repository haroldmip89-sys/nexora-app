// @vitest-environment node
// Pipeline: real route + real handleStripeEvent + PGlite, real Stripe signature (no network).
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/webhooks/stripe/route";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { processedPaymentEvents } from "@/modules/payments/schema/processed-payment-events.table";
import { projects } from "@/modules/projects/schema/projects.table";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
const SECRET = "whsec_test_secret";
const PRICE = 150_000;

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
});
afterAll(async () => {
  await ctx.client.close();
});
beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

let seq = 0;
async function seed() {
  const n = ++seq;
  const [client] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_fc_${n}`, role: "client", displayName: `C${n}`, email: `fc${n}@example.com` })
    .returning();
  const [dev] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_fd_${n}`, role: "developer", displayName: `D${n}`, email: `fd${n}@example.com` })
    .returning();
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
  const [proposal] = await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: dev.id, priceCents: PRICE, timelineWeeks: 3, description: "d", status: "accepted" })
    .returning();
  await ctx.db.insert(proposalSelections).values({ projectId: project.id, proposalId: proposal.id, selectedBy: client.id });
  const sessionId = `cs_test_flow_${n}`;
  const [attempt] = await ctx.db
    .insert(paymentAttempts)
    .values({
      projectId: project.id,
      proposalId: proposal.id,
      clientId: client.id,
      amountCents: PRICE,
      currency: "USD",
      status: "pending",
      stripeCheckoutSessionId: sessionId,
    })
    .returning();
  const body = JSON.stringify({
    id: `evt_flow_${n}`,
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        livemode: false,
        payment_status: "paid",
        amount_total: PRICE,
        currency: "usd",
        payment_intent: `pi_flow_${n}`,
        client_reference_id: attempt.id,
        metadata: {
          payment_attempt_id: attempt.id,
          project_id: project.id,
          proposal_id: proposal.id,
          client_id: client.id,
        },
      },
    },
  });
  return { projectId: project.id, attemptId: attempt.id, eventId: `evt_flow_${n}`, body };
}

const post = (body: string, signature: string) =>
  POST(
    new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body,
      headers: { "stripe-signature": signature },
    }),
  );
const sign = (body: string) => Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });

const attemptRow = async (id: string) =>
  (await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, id)))[0];
const projectRow = async (id: string) =>
  (await ctx.db.select().from(projects).where(eq(projects.id, id)))[0];
const eventRows = (id: string) =>
  ctx.db.select().from(processedPaymentEvents).where(eq(processedPaymentEvents.stripeEventId, id));

describe("webhook pipeline (route + service + DB)", () => {
  it("applies a validly signed completed event (AC6)", async () => {
    const s = await seed();
    const res = await post(s.body, sign(s.body));
    expect(res.status).toBe(200);
    expect((await attemptRow(s.attemptId)).status).toBe("completed_test");
    const project = await projectRow(s.projectId);
    expect(project.status).toBe("contracted");
    expect(project.contractedAt).not.toBeNull();
    expect(await eventRows(s.eventId)).toMatchObject([{ result: "applied", paymentAttemptId: s.attemptId }]);
  });

  it("is idempotent: the same body signed twice leaves one row (AC7)", async () => {
    const s = await seed();
    expect((await post(s.body, sign(s.body))).status).toBe(200);
    expect((await post(s.body, sign(s.body))).status).toBe(200);
    expect(await eventRows(s.eventId)).toHaveLength(1);
    expect((await projectRow(s.projectId)).status).toBe("contracted");
  });

  it("leaves the DB untouched on an invalid signature", async () => {
    const s = await seed();
    const res = await post(s.body, sign(s.body).replace(/v1=[0-9a-f]/, "v1=0"));
    expect(res.status).toBe(400);
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
    expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
    expect(await eventRows(s.eventId)).toHaveLength(0);
  });

  it("returns 500 and writes nothing when the DB fails, then applies on retry (AC14)", async () => {
    const s = await seed();
    const real = holder.db;
    holder.db = {
      transaction: async () => {
        throw new Error("neon unavailable");
      },
    };
    try {
      expect((await post(s.body, sign(s.body))).status).toBe(500);
    } finally {
      holder.db = real;
    }
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
    expect(await eventRows(s.eventId)).toHaveLength(0);
    expect((await post(s.body, sign(s.body))).status).toBe(200);
    expect((await projectRow(s.projectId)).status).toBe("contracted");
  });
});
