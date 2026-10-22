// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

const stripe = vi.hoisted(() => ({ getStripe: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: stripe.getStripe }));

import { AuthError } from "@/modules/auth/services/auth-errors";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { connectedAccounts } from "@/modules/payments/schema/connected-accounts.table";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { getConnectedAccountOverview } from "@/modules/payments/services/connected-account.service";
import { getDeveloperTransfers } from "@/modules/payments/services/developer-transfer-overview.service";
import { projects } from "@/modules/projects/schema/projects.table";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { developerRatings } from "@/modules/ratings/schema/developer-ratings.table";
import { getDeveloperRatingSummary } from "@/modules/ratings/services/rating.service";
import { users } from "@/modules/users/schema/users.table";
import { DASHBOARD_LIST_LIMIT } from "../types/dashboard.types";
import { getDeveloperDashboard } from "./developer-dashboard.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;

async function seedUser(role: AuthUser["role"], displayName?: string): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_dd_${n}`, role, displayName: displayName ?? `User ${n}`, email: `dd${n}@example.com` })
    .returning();
  return { id: row.id, clerkUserId: row.clerkUserId, role, displayName: row.displayName, email: row.email };
}

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  stripe.getStripe.mockImplementation(() => {
    throw new Error("Stripe must not be used by the dashboard");
  });
});
afterAll(async () => {
  await ctx.client.close();
});

async function seedProject(client: AuthUser, status: ProjectStatus, opts: { title?: string; updatedAt?: Date } = {}) {
  const [project] = await ctx.db
    .insert(projects)
    .values({
      clientId: client.id,
      title: opts.title ?? "Landing page",
      category: "Frontend & UI/UX",
      description: "We need a modern landing page for our bakery.",
      budgetMinCents: 100_000,
      budgetMaxCents: 200_000,
      timelineWeeks: 4,
      status,
      publishedAt: status === "draft" ? null : new Date(),
      contractedAt: status === "contracted" ? new Date() : null,
      closedAt: status === "closed" ? new Date() : null,
      ...(opts.updatedAt ? { updatedAt: opts.updatedAt } : {}),
    })
    .returning();
  return project;
}

async function seedProposal(
  projectId: string,
  status: "pending" | "accepted" | "rejected" | "withdrawn",
  developerId: string,
  priceCents = 150_000,
) {
  const [row] = await ctx.db
    .insert(proposals)
    .values({ projectId, developerId, priceCents, timelineWeeks: 3, description: "d", status })
    .returning();
  return row;
}

/** Project won by `dev` (accepted proposal + selection). */
async function seedWon(
  client: AuthUser,
  dev: AuthUser,
  status: "proposal_selected" | "contracted",
  opts: { title?: string; updatedAt?: Date; priceCents?: number } = {},
) {
  const project = await seedProject(client, status, opts);
  const accepted = await seedProposal(project.id, "accepted", dev.id, opts.priceCents);
  await ctx.db.insert(proposalSelections).values({ projectId: project.id, proposalId: accepted.id, selectedBy: client.id });
  return { project, accepted };
}

async function seedAccount(dev: AuthUser, status: "not_started" | "pending" | "restricted" | "active", stripeId?: string) {
  await ctx.db.insert(connectedAccounts).values({
    userId: dev.id,
    stripeAccountId: stripeId ?? `acct_test_${dev.id.slice(0, 8)}`,
    status,
  });
}

async function seedAttempt(
  clientId: string,
  projectId: string,
  proposalId: string,
  status: "pending" | "failed" | "canceled" | "completed_test",
  createdAt: Date,
) {
  const [row] = await ctx.db
    .insert(paymentAttempts)
    .values({
      projectId,
      proposalId,
      clientId,
      amountCents: 150_000,
      status,
      stripeCheckoutSessionId: `cs_test_${++seq}`,
      stripePaymentIntentId: status === "completed_test" ? `pi_test_${seq}` : null,
      completedAt: status === "completed_test" ? new Date() : null,
      createdAt,
    })
    .returning();
  return row;
}

async function seedTransfer(
  attempt: { id: string },
  developerId: string,
  status: "pending" | "failed" | "completed_test",
  reason: string | null = null,
) {
  await ctx.db.insert(developerTransfers).values({
    paymentAttemptId: attempt.id,
    developerId,
    amountCents: 150_000,
    status,
    stripeTransferId: status === "completed_test" ? `tr_test_${++seq}` : null,
    completedAt: status === "completed_test" ? new Date() : null,
    lastErrorCode: reason,
  });
}

async function rejectsWith(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AuthError);
  expect((err as { code: string }).code).toBe(code);
}

describe("getDeveloperDashboard", () => {
  it("empty developer: zeros, not_started account, no ratings, setup_payouts action", async () => {
    const dev = await seedUser("developer");
    const data = await getDeveloperDashboard(dev);
    expect(data).toEqual({
      proposals: { total: 0, byStatus: { pending: 0, accepted: 0, rejected: 0, withdrawn: 0 } },
      payouts: { status: "not_started", hasStripeAccount: false, statusSyncedAt: null },
      ratings: { average: null, count: 0 },
      pendingActions: [{ kind: "setup_payouts", payoutsStatus: "not_started", hasStripeAccount: false }],
      won: [],
      wonTotal: 0,
    });
  });

  it("AC2: counts all four statuses, sums total and ignores other developers", async () => {
    const dev = await seedUser("developer");
    const other = await seedUser("developer");
    const client = await seedUser("client");
    await seedProposal((await seedProject(client, "published")).id, "pending", dev.id);
    await seedProposal((await seedProject(client, "published")).id, "pending", dev.id);
    await seedProposal((await seedProject(client, "published")).id, "rejected", dev.id);
    await seedProposal((await seedProject(client, "published")).id, "withdrawn", dev.id);
    await seedWon(client, dev, "contracted");
    const before = await getDeveloperDashboard(dev);
    expect(before.proposals).toEqual({
      total: 5,
      byStatus: { pending: 2, accepted: 1, rejected: 1, withdrawn: 1 },
    });
    await seedProposal((await seedProject(client, "published")).id, "pending", other.id);
    await seedWon(client, other, "proposal_selected");
    expect((await getDeveloperDashboard(dev)).proposals).toEqual(before.proposals);
  });

  it("AC3: won only includes own accepted proposals in proposal_selected | contracted", async () => {
    const dev = await seedUser("developer");
    const other = await seedUser("developer");
    const client = await seedUser("client", "Maria Gonzalez");
    await seedWon(client, dev, "proposal_selected", { title: "Selected", priceCents: 111_100 });
    await seedWon(client, dev, "contracted", { title: "Contracted", priceCents: 222_200 });
    const closed = await seedProject(client, "closed", { title: "Closed project" });
    await seedProposal(closed.id, "accepted", dev.id);
    const rejectedProject = await seedProject(client, "published", { title: "Rejected project" });
    await seedProposal(rejectedProject.id, "rejected", dev.id);
    await seedWon(client, other, "contracted", { title: "Someone else's" });

    const data = await getDeveloperDashboard(dev);
    expect(data.wonTotal).toBe(2);
    expect(data.won.map((w) => w.title).sort()).toEqual(["Contracted", "Selected"]);
    const byTitle = Object.fromEntries(data.won.map((w) => [w.title, w]));
    expect(byTitle["Selected"]).toMatchObject({
      status: "proposal_selected",
      amountCents: 111_100,
      clientName: "Maria G.",
      payment: null,
      transfer: null,
    });
    expect(byTitle["Contracted"].amountCents).toBe(222_200);
  });

  it("AC3: clientName falls back to 'Cliente' when the display name does not look like a name", async () => {
    const dev = await seedUser("developer");
    const client = await seedUser("client", "x@y.com");
    await seedWon(client, dev, "contracted");
    const data = await getDeveloperDashboard(dev);
    expect(data.won[0].clientName).toBe("Cliente");
  });

  it("AC3: ordering, limit and real total; latest attempt and transfer of the completed_test attempt", async () => {
    const dev = await seedUser("developer");
    const client = await seedUser("client");
    const total = DASHBOARD_LIST_LIMIT + 3;
    const ids: string[] = [];
    for (let i = 0; i < total; i++) {
      const { project, accepted } = await seedWon(client, dev, "proposal_selected", {
        title: `P${i}`,
        updatedAt: at(1000 - i),
      });
      ids.push(project.id);
      if (i === total - 1) {
        await seedAttempt(client.id, project.id, accepted.id, "failed", at(40));
        const done = await seedAttempt(client.id, project.id, accepted.id, "completed_test", at(10));
        await seedTransfer(done, dev.id, "failed", "STRIPE_UNAVAILABLE");
      }
    }
    const data = await getDeveloperDashboard(dev);
    expect(data.wonTotal).toBe(total);
    expect(data.won).toHaveLength(DASHBOARD_LIST_LIMIT);
    expect(data.won[0].projectId).toBe(ids[total - 1]);
    expect(data.won[0].payment?.status).toBe("completed_test");
    expect(data.won[0].transfer).toEqual({ status: "failed", completedAt: null, reason: "STRIPE_UNAVAILABLE" });
    expect(data.won[1].payment).toBeNull();
    expect(data.won[1].transfer).toBeNull();
    expect(data.pendingActions.length).toBeLessThanOrEqual(DASHBOARD_LIST_LIMIT);
  });

  it("AC3: the latest attempt wins over older ones (canceled then pending)", async () => {
    const dev = await seedUser("developer");
    const client = await seedUser("client");
    const { project, accepted } = await seedWon(client, dev, "proposal_selected");
    await seedAttempt(client.id, project.id, accepted.id, "canceled", at(30));
    await seedAttempt(client.id, project.id, accepted.id, "pending", at(5));
    const data = await getDeveloperDashboard(dev);
    expect(data.won[0].payment?.status).toBe("pending");
  });

  it("AC4: payouts and ratings match the reused services", async () => {
    const dev = await seedUser("developer");
    const client = await seedUser("client");
    const noAccount = await getDeveloperDashboard(dev);
    expect(noAccount.payouts).toEqual(await getConnectedAccountOverview(dev));
    expect(noAccount.payouts.status).toBe("not_started");
    expect(noAccount.ratings).toEqual({ average: null, count: 0 });

    await seedAccount(dev, "active");
    const a = await seedWon(client, dev, "contracted");
    const client2 = await seedUser("client");
    const b = await seedWon(client2, dev, "contracted");
    await ctx.db.insert(developerRatings).values({ projectId: a.project.id, proposalId: a.accepted.id, rating: 5 });
    await ctx.db.insert(developerRatings).values({ projectId: b.project.id, proposalId: b.accepted.id, rating: 4 });

    const data = await getDeveloperDashboard(dev);
    expect(data.payouts).toEqual(await getConnectedAccountOverview(dev));
    expect(data.payouts).toMatchObject({ status: "active", hasStripeAccount: true });
    expect(data.ratings).toEqual(await getDeveloperRatingSummary(dev.id));
    expect(data.ratings).toEqual({ average: 4.5, count: 2 });
    expect(data.pendingActions.some((x) => x.kind === "setup_payouts")).toBe(false);
  });

  it("AC5 integration: awaiting_payment reflects the account state", async () => {
    const dev = await seedUser("developer");
    const client = await seedUser("client");
    const { project } = await seedWon(client, dev, "proposal_selected", { title: "Waiting" });
    expect((await getDeveloperDashboard(dev)).pendingActions).toEqual([
      { kind: "setup_payouts", payoutsStatus: "not_started", hasStripeAccount: false },
      { kind: "awaiting_payment", projectId: project.id, projectTitle: "Waiting", payoutsReady: false },
    ]);
    await seedAccount(dev, "active");
    expect((await getDeveloperDashboard(dev)).pendingActions).toEqual([
      { kind: "awaiting_payment", projectId: project.id, projectTitle: "Waiting", payoutsReady: true },
    ]);
  });

  it("AC6: transfer states of won and retry_transfer match getDeveloperTransfers", async () => {
    const dev = await seedUser("developer");
    const client = await seedUser("client");
    await seedAccount(dev, "active");
    const none = await seedWon(client, dev, "contracted", { title: "No transfer" });
    await seedAttempt(client.id, none.project.id, none.accepted.id, "completed_test", at(30));
    const pending = await seedWon(client, dev, "contracted", { title: "Pending transfer" });
    await seedTransfer(
      await seedAttempt(client.id, pending.project.id, pending.accepted.id, "completed_test", at(30)),
      dev.id,
      "pending",
      "PAYMENT_NOT_SETTLED",
    );
    const failed = await seedWon(client, dev, "contracted", { title: "Failed transfer" });
    await seedTransfer(
      await seedAttempt(client.id, failed.project.id, failed.accepted.id, "completed_test", at(30)),
      dev.id,
      "failed",
      "STRIPE_UNAVAILABLE",
    );
    const done = await seedWon(client, dev, "contracted", { title: "Done transfer" });
    await seedTransfer(
      await seedAttempt(client.id, done.project.id, done.accepted.id, "completed_test", at(30)),
      dev.id,
      "completed_test",
    );

    const data = await getDeveloperDashboard(dev);
    const oracle = await getDeveloperTransfers(dev);
    const oracleByTitle = new Map(oracle.map((t) => [t.projectTitle, t]));
    expect(oracle).toHaveLength(3);
    for (const row of data.won) {
      const expected = oracleByTitle.get(row.title);
      expect(row.transfer?.status).toBe(expected?.status);
      expect(row.transfer?.reason).toBe(expected?.reason);
    }
    const retryTitles = data.pendingActions.flatMap((a) => (a.kind === "retry_transfer" ? [a.projectTitle] : [])).sort();
    const oracleRetry = oracle.filter((t) => t.status === "pending" || t.status === "failed").map((t) => t.projectTitle).sort();
    expect(retryTitles).toEqual(oracleRetry);
    expect(retryTitles).toEqual(["Failed transfer", "Pending transfer"]);
    expect(data.won.find((w) => w.title === "No transfer")?.transfer).toBeNull();
  });

  it("AC7: exposes exactly the explicit projection, no Stripe ids, no email, nothing from other developers", async () => {
    const dev = await seedUser("developer", "Visible Dev");
    const other = await seedUser("developer", "Hidden Dev");
    const client = await seedUser("client", "Maria Gonzalez");
    await seedAccount(dev, "pending", "acct_test_seeded_own");
    await seedAccount(other, "active", "acct_test_seeded_other");
    const mine = await seedWon(client, dev, "contracted", { title: "My project" });
    await seedTransfer(
      await seedAttempt(client.id, mine.project.id, mine.accepted.id, "completed_test", at(5)),
      dev.id,
      "pending",
      "ACCOUNT_NOT_ACTIVE",
    );
    const waiting = await seedWon(client, dev, "proposal_selected", { title: "Waiting project" });
    await seedAttempt(client.id, waiting.project.id, waiting.accepted.id, "pending", at(5));
    const theirs = await seedWon(client, other, "contracted", { title: "Other dev project" });
    await seedTransfer(
      await seedAttempt(client.id, theirs.project.id, theirs.accepted.id, "completed_test", at(5)),
      other.id,
      "completed_test",
    );

    const data = await getDeveloperDashboard(dev);
    expect(Object.keys(data).sort()).toEqual(["payouts", "pendingActions", "proposals", "ratings", "won", "wonTotal"]);
    expect(Object.keys(data.proposals).sort()).toEqual(["byStatus", "total"]);
    expect(Object.keys(data.proposals.byStatus).sort()).toEqual(["accepted", "pending", "rejected", "withdrawn"]);
    expect(Object.keys(data.payouts).sort()).toEqual(["hasStripeAccount", "status", "statusSyncedAt"]);
    expect(Object.keys(data.ratings).sort()).toEqual(["average", "count"]);

    const shapes: Record<string, string[]> = {
      setup_payouts: ["hasStripeAccount", "kind", "payoutsStatus"],
      retry_transfer: ["kind", "projectId", "projectTitle", "reason", "transferStatus"],
      awaiting_payment: ["kind", "payoutsReady", "projectId", "projectTitle"],
    };
    const kinds = new Set<string>();
    for (const action of data.pendingActions) {
      kinds.add(action.kind);
      expect(Object.keys(action).sort()).toEqual(shapes[action.kind]);
    }
    expect([...kinds].sort()).toEqual(["awaiting_payment", "retry_transfer", "setup_payouts"]);

    for (const row of data.won) {
      expect(Object.keys(row).sort()).toEqual(
        ["amountCents", "clientName", "payment", "projectId", "status", "title", "transfer"],
      );
    }
    const withTransfer = data.won.find((w) => w.title === "My project")!;
    expect(Object.keys(withTransfer.payment!).sort()).toEqual(["status", "updatedAt"]);
    expect(Object.keys(withTransfer.transfer!).sort()).toEqual(["completedAt", "reason", "status"]);

    const json = JSON.stringify(data);
    for (const forbidden of ["acct_", "tr_test_", "tr_", "cs_", "pi_", "@example.com", "Hidden Dev", "Other dev project", "Gonzalez"]) {
      expect(json).not.toContain(forbidden);
    }
    expect(json).toContain("Maria G.");
    expect(data.won).toHaveLength(2);
  });

  it("AC8: client and admin get FORBIDDEN without touching the database", async () => {
    const client = await seedUser("client");
    const admin = await seedUser("admin");
    const spy = vi.spyOn(ctx.db, "select");
    await rejectsWith(getDeveloperDashboard(client), "FORBIDDEN");
    await rejectsWith(getDeveloperDashboard(admin), "FORBIDDEN");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("AC8: never calls Stripe (getStripe throws and the dashboard is still computed)", async () => {
    const dev = await seedUser("developer");
    const client = await seedUser("client");
    await seedAccount(dev, "active");
    await seedWon(client, dev, "proposal_selected");
    await expect(getDeveloperDashboard(dev)).resolves.toBeDefined();
    expect(stripe.getStripe).not.toHaveBeenCalled();
  });
});
