// @vitest-environment node
// NOTE: PGlite is single-connection and serializes transactions, so the Promise.allSettled test below
// proves that the final state is coherent in any execution order. It does NOT demonstrate the real
// FOR UPDATE behavior under true concurrency (Neon/Postgres); that is validated by reading the SQL.
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const inject = vi.hoisted(() => ({ contractFailures: 0 }));
vi.mock("@/modules/projects/services/project-transitions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/projects/services/project-transitions")>();
  return {
    ...original,
    markContracted: async (...args: Parameters<typeof original.markContracted>) => {
      if (inject.contractFailures > 0) {
        inject.contractFailures--;
        throw new Error("injected failure");
      }
      return original.markContracted(...args);
    },
  };
});

import { ProjectError } from "@/modules/projects/services/project-errors";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import { processedPaymentEvents } from "@/modules/payments/schema/processed-payment-events.table";
import { projects } from "@/modules/projects/schema/projects.table";
import { closeProject } from "@/modules/projects/services/project.service";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";
import { handleStripeEvent } from "./payment-event.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;
let client: AuthUser;

const PRICE = 150_000;
const EMAIL = "secret.customer@example.com";

async function seedClient(): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_e_${n}`, role: "client", displayName: `U${n}`, email: `e${n}@example.com` })
    .returning();
  return { id: row.id, clerkUserId: row.clerkUserId, role: "client", displayName: row.displayName, email: row.email };
}

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  client = await seedClient();
});
afterAll(async () => {
  await ctx.client.close();
});

let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  inject.contractFailures = 0;
  holder.db = ctx.db;
  transferMock.run.mockReset();
  transferMock.run.mockResolvedValue(undefined);
  logs = [
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "info").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
  ];
});
afterEach(async () => {
  vi.restoreAllMocks();
  // Common invariant: completed_test always has intent + completed_at; others never have completed_at.
  const rows = await ctx.db.select().from(paymentAttempts);
  for (const r of rows) {
    if (r.status === "completed_test") {
      expect(r.stripePaymentIntentId).not.toBeNull();
      expect(r.completedAt).not.toBeNull();
    } else {
      expect(r.completedAt).toBeNull();
      expect(r.stripePaymentIntentId).toBeNull();
    }
  }
});

type Seeded = { projectId: string; attemptId: string; proposalId: string; sessionId: string };

async function seed(
  opts: { project?: ProjectStatus; attempt?: "pending" | "completed_test" | "failed" | "canceled" } = {},
): Promise<Seeded> {
  const n = ++seq;
  const projectStatus = opts.project ?? "proposal_selected";
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
      status: projectStatus,
      publishedAt: new Date(),
      closedAt: projectStatus === "closed" ? new Date() : null,
    })
    .returning();
  const [dev] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_d_${n}`, role: "developer", displayName: `D${n}`, email: `d${n}@example.com` })
    .returning();
  const [proposal] = await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: dev.id, priceCents: PRICE, timelineWeeks: 3, description: "d", status: "accepted" })
    .returning();
  await ctx.db.insert(proposalSelections).values({ projectId: project.id, proposalId: proposal.id, selectedBy: client.id });
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
      stripeCheckoutSessionId: `cs_test_${n}`,
      stripePaymentIntentId: status === "completed_test" ? `pi_seed_${n}` : null,
      completedAt: status === "completed_test" ? new Date() : null,
    })
    .returning();
  return { projectId: project.id, attemptId: attempt.id, proposalId: proposal.id, sessionId: `cs_test_${n}` };
}

type EventType =
  | "checkout.session.completed"
  | "checkout.session.async_payment_succeeded"
  | "checkout.session.async_payment_failed"
  | "checkout.session.expired";

let evtSeq = 0;
function makeEvent(
  type: string,
  s: Seeded,
  over: { id?: string; livemode?: boolean; session?: Record<string, unknown> } = {},
): Stripe.Event {
  const session = {
    id: s.sessionId,
    object: "checkout.session",
    livemode: false,
    payment_status: "paid",
    amount_total: PRICE,
    currency: "usd",
    payment_intent: `pi_test_${s.sessionId}`,
    client_reference_id: s.attemptId,
    metadata: { payment_attempt_id: s.attemptId, project_id: s.projectId, proposal_id: s.proposalId, client_id: client.id },
    customer_details: { email: EMAIL },
    url: "https://checkout.stripe.com/c/pay/secret_url",
    ...over.session,
  };
  return {
    id: over.id ?? `evt_${++evtSeq}`,
    object: "event",
    type,
    livemode: over.livemode ?? false,
    data: { object: session },
  } as unknown as Stripe.Event;
}
const completed = (s: Seeded, over?: Parameters<typeof makeEvent>[2]) =>
  makeEvent("checkout.session.completed" satisfies EventType, s, over);

const attemptRow = async (id: string) =>
  (await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, id)))[0];
const projectRow = async (id: string) =>
  (await ctx.db.select().from(projects).where(eq(projects.id, id)))[0];
const eventRows = (id?: string) =>
  id
    ? ctx.db.select().from(processedPaymentEvents).where(eq(processedPaymentEvents.stripeEventId, id))
    : ctx.db.select().from(processedPaymentEvents);

describe("handleStripeEvent: completed", () => {
  it("completes the attempt, contracts the project and records one applied row (AC6)", async () => {
    const s = await seed();
    const event = completed(s);
    expect(await handleStripeEvent(event)).toEqual({ result: "applied", reason: "completed" });

    const attempt = await attemptRow(s.attemptId);
    expect(attempt.status).toBe("completed_test");
    expect(attempt.stripePaymentIntentId).toBe(`pi_test_${s.sessionId}`);
    expect(attempt.completedAt).not.toBeNull();
    const project = await projectRow(s.projectId);
    expect(project.status).toBe("contracted");
    expect(project.contractedAt).not.toBeNull();
    expect(await eventRows(event.id)).toMatchObject([
      { type: "checkout.session.completed", result: "applied", paymentAttemptId: s.attemptId },
    ]);
  });

  it("accepts an expanded PaymentIntent object and async_payment_succeeded", async () => {
    const s = await seed();
    const event = makeEvent("checkout.session.async_payment_succeeded", s, {
      session: { payment_intent: { id: "pi_expanded" } },
    });
    expect(await handleStripeEvent(event)).toEqual({ result: "applied", reason: "completed" });
    expect((await attemptRow(s.attemptId)).stripePaymentIntentId).toBe("pi_expanded");
  });

  it("unpaid is ignored, then async_payment_succeeded completes (AC9)", async () => {
    const s = await seed();
    const first = await handleStripeEvent(completed(s, { session: { payment_status: "unpaid" } }));
    expect(first).toEqual({ result: "ignored", reason: "payment_not_paid" });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
    expect((await projectRow(s.projectId)).status).toBe("proposal_selected");

    const second = await handleStripeEvent(makeEvent("checkout.session.async_payment_succeeded", s));
    expect(second).toEqual({ result: "applied", reason: "completed" });
    expect((await projectRow(s.projectId)).status).toBe("contracted");
  });

  it("a second completed event on the same attempt is ignored (attempt_not_pending)", async () => {
    const s = await seed();
    await handleStripeEvent(completed(s));
    expect(await handleStripeEvent(completed(s))).toEqual({ result: "ignored", reason: "attempt_not_pending" });
    expect((await attemptRow(s.attemptId)).status).toBe("completed_test");
  });

  it("completed on canceled or failed attempts never reopens them and logs an anomaly (AC10)", async () => {
    for (const status of ["canceled", "failed"] as const) {
      const s = await seed({ attempt: status });
      expect(await handleStripeEvent(completed(s))).toEqual({ result: "ignored", reason: "attempt_not_pending" });
      expect((await attemptRow(s.attemptId)).status).toBe(status);
      expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
    }
    expect(logs[0]).toHaveBeenCalled();
  });

  it("amount mismatch leaves the attempt pending (AC11)", async () => {
    const s = await seed();
    const event = completed(s, { session: { amount_total: PRICE + 1 } });
    expect(await handleStripeEvent(event)).toEqual({ result: "ignored", reason: "amount_mismatch" });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
    expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
    expect(await eventRows(event.id)).toMatchObject([{ result: "ignored", paymentAttemptId: s.attemptId }]);
    expect(JSON.stringify(logs[0].mock.calls)).not.toContain(String(PRICE));
  });

  it("currency mismatch leaves the attempt pending (AC11)", async () => {
    const s = await seed();
    expect(await handleStripeEvent(completed(s, { session: { currency: "eur" } }))).toEqual({
      result: "ignored",
      reason: "currency_mismatch",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("paid session without PaymentIntent is ignored", async () => {
    const s = await seed();
    expect(await handleStripeEvent(completed(s, { session: { payment_intent: null } }))).toEqual({
      result: "ignored",
      reason: "missing_payment_intent",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("project not in proposal_selected: attempt completes, project untouched (AC15)", async () => {
    const s = await seed({ project: "closed" });
    expect(await handleStripeEvent(completed(s))).toEqual({
      result: "applied",
      reason: "completed_project_not_selected",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("completed_test");
    const project = await projectRow(s.projectId);
    expect(project.status).toBe("closed");
    expect(project.contractedAt).toBeNull();
    expect(await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.projectId, s.projectId))).toHaveLength(1);
    expect(logs[0]).toHaveBeenCalled();
  });
});

describe("handleStripeEvent: expired and failed", () => {
  it("expired on pending cancels it, keeps the project and unblocks closeProject (AC8)", async () => {
    const s = await seed();
    await expect(closeProject(client, s.projectId)).rejects.toMatchObject({ code: "PAYMENT_IN_PROGRESS" });
    const event = makeEvent("checkout.session.expired", s);
    expect(await handleStripeEvent(event)).toEqual({ result: "applied", reason: "canceled" });
    expect((await attemptRow(s.attemptId)).status).toBe("canceled");
    expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
    expect(await eventRows(event.id)).toMatchObject([{ result: "applied" }]);
    await expect(closeProject(client, s.projectId)).resolves.toBeDefined();
  });

  it("expired on canceled, completed_test or failed is ignored (AC8)", async () => {
    for (const status of ["canceled", "completed_test", "failed"] as const) {
      const s = await seed({ attempt: status });
      const event = makeEvent("checkout.session.expired", s);
      expect(await handleStripeEvent(event)).toEqual({ result: "ignored", reason: "attempt_not_pending" });
      expect((await attemptRow(s.attemptId)).status).toBe(status);
      expect(await eventRows(event.id)).toHaveLength(1);
    }
  });

  it("async_payment_failed fails a pending attempt and allows a retry (AC9)", async () => {
    const s = await seed();
    expect(await handleStripeEvent(makeEvent("checkout.session.async_payment_failed", s))).toEqual({
      result: "applied",
      reason: "failed",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("failed");
    expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
  });

  it("a late async_payment_failed never touches a completed_test (AC9)", async () => {
    const s = await seed();
    await handleStripeEvent(completed(s));
    expect(await handleStripeEvent(makeEvent("checkout.session.async_payment_failed", s))).toEqual({
      result: "ignored",
      reason: "attempt_not_pending",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("completed_test");
    expect((await projectRow(s.projectId)).status).toBe("contracted");
  });

  it("contracted projects can still be closed afterwards", async () => {
    const s = await seed();
    await handleStripeEvent(completed(s));
    await expect(closeProject(client, s.projectId)).resolves.toBeDefined();
    expect((await attemptRow(s.attemptId)).status).toBe("completed_test");
  });
});

describe("handleStripeEvent: idempotency and filtering", () => {
  it("the same event id twice is a duplicate with one row (AC7)", async () => {
    const s = await seed();
    const event = completed(s);
    await handleStripeEvent(event);
    expect(await handleStripeEvent(event)).toEqual({ result: "duplicate" });
    expect(await eventRows(event.id)).toHaveLength(1);
    expect((await projectRow(s.projectId)).status).toBe("contracted");
  });

  it("two simultaneous deliveries leave one applied and one duplicate (AC7)", async () => {
    const s = await seed();
    const event = completed(s);
    const results = await Promise.allSettled([handleStripeEvent(event), handleStripeEvent(event)]);
    const values = results.map((r) => (r.status === "fulfilled" ? r.value.result : "rejected")).sort();
    expect(values).toEqual(["applied", "duplicate"]);
    expect(await eventRows(event.id)).toHaveLength(1);
    expect((await projectRow(s.projectId)).status).toBe("contracted");
  });

  it("unhandled types return unhandled without writing a row (AC9)", async () => {
    const s = await seed();
    const before = (await eventRows()).length;
    expect(await handleStripeEvent(makeEvent("payment_intent.payment_failed", s))).toEqual({ result: "unhandled" });
    expect((await eventRows()).length).toBe(before);
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("livemode events (event or session) are discarded without any write (AC12)", async () => {
    const s = await seed();
    const before = (await eventRows()).length;
    expect(await handleStripeEvent(completed(s, { livemode: true }))).toEqual({ result: "discarded", reason: "livemode" });
    expect(await handleStripeEvent(completed(s, { session: { livemode: true } }))).toEqual({
      result: "discarded",
      reason: "livemode",
    });
    expect((await eventRows()).length).toBe(before);
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
    expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
  });
});

describe("handleStripeEvent: localization and validation (AC13)", () => {
  it("unknown session -> attempt_not_found with a NULL attempt id", async () => {
    const s = await seed();
    const event = completed(s, { session: { id: "cs_test_unknown" } });
    expect(await handleStripeEvent(event)).toEqual({ result: "ignored", reason: "attempt_not_found" });
    expect(await eventRows(event.id)).toMatchObject([{ result: "ignored", paymentAttemptId: null }]);
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("correct metadata with an unknown session id never locates an attempt", async () => {
    const s = await seed();
    const event = completed(s, { session: { id: "cs_test_other" } });
    expect((await handleStripeEvent(event)).result).toBe("ignored");
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it("client_reference_id different from the attempt -> reference_mismatch", async () => {
    const s = await seed();
    const other = await seed();
    expect(await handleStripeEvent(completed(s, { session: { client_reference_id: other.attemptId } }))).toEqual({
      result: "ignored",
      reason: "reference_mismatch",
    });
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
  });

  it.each(["payment_attempt_id", "project_id", "proposal_id", "client_id"])(
    "metadata %s different from the DB -> reference_mismatch",
    async (key) => {
      const s = await seed();
      const event = completed(s);
      const session = event.data.object as unknown as { metadata: Record<string, string> };
      session.metadata[key] = "11111111-1111-4111-8111-111111111111";
      expect(await handleStripeEvent(event)).toEqual({ result: "ignored", reason: "reference_mismatch" });
      expect((await attemptRow(s.attemptId)).status).toBe("pending");
      expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
    },
  );
});

describe("handleStripeEvent: atomicity (AC14)", () => {
  it("a failure after the attempt update reverts everything, including the event row", async () => {
    const s = await seed();
    const event = completed(s);
    inject.contractFailures = 1;
    await expect(handleStripeEvent(event)).rejects.toThrow("injected failure");
    expect((await attemptRow(s.attemptId)).status).toBe("pending");
    expect((await projectRow(s.projectId)).status).toBe("proposal_selected");
    expect(await eventRows(event.id)).toHaveLength(0);

    expect(await handleStripeEvent(event)).toEqual({ result: "applied", reason: "completed" });
    expect((await projectRow(s.projectId)).status).toBe("contracted");
  });
});

describe("handleStripeEvent: logs (AC17)", () => {
  it("never logs the session, customer email, URL or ids of Stripe objects", async () => {
    const s = await seed();
    await handleStripeEvent(completed(s));
    await handleStripeEvent(completed(s, { session: { amount_total: 1 } }));
    await handleStripeEvent(completed(s, { livemode: true }));
    const text = JSON.stringify(logs.flatMap((l) => l.mock.calls));
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain("secret_url");
    expect(text).not.toContain("pi_test_");
    expect(text).not.toContain("customer_details");
  });
});

describe("closeProject regression", () => {
  it("still blocks with a pending attempt and allows after canceled/failed", async () => {
    const pending = await seed();
    await expect(closeProject(client, pending.projectId)).rejects.toBeInstanceOf(ProjectError);
    for (const status of ["canceled", "failed"] as const) {
      const s = await seed({ attempt: status });
      await expect(closeProject(client, s.projectId)).resolves.toBeDefined();
    }
  });
});

const transferRows = (attemptId: string) =>
  ctx.db.select().from(developerTransfers).where(eq(developerTransfers.paymentAttemptId, attemptId));

describe("handleStripeEvent: developer transfer (011b AC11 to AC12)", () => {
  it("creates exactly one pending transfer in the payment transaction and runs it post-commit", async () => {
    const s = await seed();
    transferMock.run.mockImplementation(async (attemptId: string) => {
      // Post-commit: the payment and the transfer row are already visible.
      expect((await attemptRow(attemptId)).status).toBe("completed_test");
      expect(await transferRows(attemptId)).toHaveLength(1);
    });
    expect(await handleStripeEvent(completed(s))).toEqual({ result: "applied", reason: "completed" });
    const rows = await transferRows(s.attemptId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", amountCents: PRICE, currency: "USD" });
    expect(transferMock.run).toHaveBeenCalledTimes(1);
    expect(transferMock.run).toHaveBeenCalledWith(s.attemptId);
  });

  it("completed_project_not_selected also creates the row and runs the transfer", async () => {
    const s = await seed({ project: "closed" });
    expect(await handleStripeEvent(completed(s))).toEqual({
      result: "applied",
      reason: "completed_project_not_selected",
    });
    expect(await transferRows(s.attemptId)).toHaveLength(1);
    expect(transferMock.run).toHaveBeenCalledWith(s.attemptId);
  });

  it("a rollback leaves no transfer row and does not run the transfer", async () => {
    const s = await seed();
    inject.contractFailures = 1;
    await expect(handleStripeEvent(completed(s))).rejects.toThrow("injected failure");
    expect(await transferRows(s.attemptId)).toHaveLength(0);
    expect(transferMock.run).not.toHaveBeenCalled();
  });

  it("does not run for duplicate, ignored, unhandled, discarded, failed or canceled", async () => {
    const s = await seed();
    const event = completed(s);
    await handleStripeEvent(event);
    transferMock.run.mockClear();
    await handleStripeEvent(event); // duplicate
    await handleStripeEvent(completed(s)); // ignored: attempt_not_pending
    const other = await seed();
    await handleStripeEvent(completed(other, { session: { payment_status: "unpaid" } })); // ignored
    await handleStripeEvent(makeEvent("payment_intent.payment_failed", other)); // unhandled
    await handleStripeEvent(completed(other, { livemode: true })); // discarded
    await handleStripeEvent(makeEvent("checkout.session.async_payment_failed", other)); // failed
    const third = await seed();
    await handleStripeEvent(makeEvent("checkout.session.expired", third)); // canceled
    expect(transferMock.run).not.toHaveBeenCalled();
    expect(await transferRows(other.attemptId)).toHaveLength(0);
    expect(await transferRows(third.attemptId)).toHaveLength(0);
  });

  it("a transfer that throws never changes the webhook result", async () => {
    const s = await seed();
    transferMock.run.mockRejectedValue(new Error("boom"));
    expect(await handleStripeEvent(completed(s))).toEqual({ result: "applied", reason: "completed" });
    expect((await attemptRow(s.attemptId)).status).toBe("completed_test");
    expect(await transferRows(s.attemptId)).toHaveLength(1);
  });
});
