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
import { getProjectPaymentOverview } from "@/modules/payments/services/payment-overview.service";
import { projects } from "@/modules/projects/schema/projects.table";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { developerRatings } from "@/modules/ratings/schema/developer-ratings.table";
import { users } from "@/modules/users/schema/users.table";
import { DASHBOARD_LIST_LIMIT } from "../types/dashboard.types";
import { getClientDashboard } from "./client-dashboard.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;

async function seedUser(role: AuthUser["role"], displayName?: string): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_d_${n}`, role, displayName: displayName ?? `User ${n}`, email: `d${n}@example.com` })
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

async function seedProject(
  client: AuthUser,
  status: ProjectStatus,
  opts: { title?: string; updatedAt?: Date } = {},
) {
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
  developerId?: string,
  createdAt?: Date,
) {
  const devId = developerId ?? (await seedUser("developer")).id;
  const [row] = await ctx.db
    .insert(proposals)
    .values({
      projectId,
      developerId: devId,
      priceCents: 150_000,
      timelineWeeks: 3,
      description: "d",
      status,
      ...(createdAt ? { createdAt } : {}),
    })
    .returning();
  return row;
}

async function seedWinner(
  client: AuthUser,
  status: "proposal_selected" | "contracted",
  opts: { payouts?: "active" | "pending" | "none"; title?: string; updatedAt?: Date; name?: string } = {},
) {
  const project = await seedProject(client, status, opts);
  const dev = await seedUser("developer", opts.name ?? "Dana Developer");
  const payouts = opts.payouts ?? "active";
  if (payouts !== "none") {
    await ctx.db.insert(connectedAccounts).values({
      userId: dev.id,
      stripeAccountId: `acct_test_${dev.id.slice(0, 8)}`,
      status: payouts,
    });
  }
  const accepted = await seedProposal(project.id, "accepted", dev.id);
  await ctx.db.insert(proposalSelections).values({ projectId: project.id, proposalId: accepted.id, selectedBy: client.id });
  return { project, dev, accepted };
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
) {
  await ctx.db.insert(developerTransfers).values({
    paymentAttemptId: attempt.id,
    developerId,
    amountCents: 150_000,
    status,
    stripeTransferId: status === "completed_test" ? `tr_test_${++seq}` : null,
    completedAt: status === "completed_test" ? new Date() : null,
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

describe("getClientDashboard", () => {
  it("empty client: all five counts present with 0", async () => {
    const client = await seedUser("client");
    const data = await getClientDashboard(client);
    expect(data).toEqual({
      counts: { total: 0, byStatus: { draft: 0, published: 0, proposal_selected: 0, contracted: 0, closed: 0 } },
      pendingActions: [],
      contracting: [],
      contractingTotal: 0,
    });
  });

  it("counts by status, total, and only the actor's projects", async () => {
    const client = await seedUser("client");
    const other = await seedUser("client");
    await seedProject(client, "draft");
    await seedProject(client, "draft");
    await seedProject(client, "published");
    await seedProject(client, "closed");
    await seedWinner(client, "contracted");
    await seedProject(other, "published");
    await seedWinner(other, "proposal_selected");
    const data = await getClientDashboard(client);
    expect(data.counts).toEqual({
      total: 5,
      byStatus: { draft: 2, published: 1, proposal_selected: 0, contracted: 1, closed: 1 },
    });
    expect(data.contracting).toHaveLength(1);
    expect(data.contractingTotal).toBe(1);
  });

  it("choose_proposal only for published with pending proposals, with the right count", async () => {
    const client = await seedUser("client");
    const withPending = await seedProject(client, "published", { title: "With pending" });
    await seedProposal(withPending.id, "pending");
    await seedProposal(withPending.id, "pending");
    await seedProposal(withPending.id, "rejected");
    await seedProposal(withPending.id, "withdrawn");
    const onlyRejected = await seedProject(client, "published");
    await seedProposal(onlyRejected.id, "rejected");
    await seedProject(client, "published");
    const draft = await seedProject(client, "draft");
    await seedProposal(draft.id, "pending");
    const data = await getClientDashboard(client);
    expect(data.pendingActions).toEqual([
      { kind: "choose_proposal", projectId: withPending.id, projectTitle: "With pending", pendingProposals: 2 },
    ]);
  });

  it("choose_proposal is ordered by the oldest pending proposal first", async () => {
    const client = await seedUser("client");
    const newer = await seedProject(client, "published", { title: "Newer" });
    await seedProposal(newer.id, "pending", undefined, at(5));
    const older = await seedProject(client, "published", { title: "Older" });
    await seedProposal(older.id, "pending", undefined, at(50));
    const data = await getClientDashboard(client);
    expect(data.pendingActions.map((a) => a.projectTitle)).toEqual(["Older", "Newer"]);
  });

  it("payment actions follow the D-L table, including edge cases, ordered resume, start, choose, rate", async () => {
    const client = await seedUser("client");
    const published = await seedProject(client, "published", { title: "Published" });
    await seedProposal(published.id, "pending");
    const rate = await seedWinner(client, "contracted", { title: "To rate" });
    const rated = await seedWinner(client, "contracted", { title: "Rated" });
    await ctx.db.insert(developerRatings).values({ projectId: rated.project.id, proposalId: rated.accepted.id, rating: 5 });
    const start = await seedWinner(client, "proposal_selected", { title: "Start" });
    const afterFailed = await seedWinner(client, "proposal_selected", { title: "After failed" });
    await seedAttempt(client.id, afterFailed.project.id, afterFailed.accepted.id, "canceled", at(30));
    await seedAttempt(client.id, afterFailed.project.id, afterFailed.accepted.id, "failed", at(20));
    const resume = await seedWinner(client, "proposal_selected", { title: "Resume" });
    await seedAttempt(client.id, resume.project.id, resume.accepted.id, "pending", at(2));
    await seedWinner(client, "proposal_selected", { title: "No account", payouts: "none" });
    await seedWinner(client, "proposal_selected", { title: "Pending account", payouts: "pending" });
    const closed = await seedProject(client, "closed", { title: "Closed" });
    await seedProposal(closed.id, "pending");

    const data = await getClientDashboard(client);
    expect(data.pendingActions.map((a) => [a.kind, a.projectTitle])).toEqual([
      ["resume_payment", "Resume"],
      ["start_payment", expect.stringMatching(/^(Start|After failed)$/)],
      ["start_payment", expect.stringMatching(/^(Start|After failed)$/)],
      ["choose_proposal", "Published"],
      ["rate", "To rate"],
    ]);
    expect(data.pendingActions.filter((a) => a.kind === "start_payment").map((a) => a.projectId).sort()).toEqual(
      [start.project.id, afterFailed.project.id].sort(),
    );
    expect(data.pendingActions.some((a) => a.projectId === rate.project.id && a.kind === "rate")).toBe(true);
    expect(data.pendingActions.some((a) => a.projectTitle === "Rated" || a.projectTitle === "Closed")).toBe(false);
    const byTitle = Object.fromEntries(data.contracting.map((c) => [c.title, c]));
    expect(byTitle["No account"].developerPayoutsReady).toBe(false);
    expect(byTitle["Pending account"].developerPayoutsReady).toBe(false);
    expect(byTitle["Rated"].rated).toBe(true);
    expect(byTitle["To rate"].rated).toBe(false);
  });

  it("contracting: ordering, limit, real total, latest attempt and transfer of the completed_test attempt", async () => {
    const client = await seedUser("client");
    const dev = await seedUser("developer", "Shared Dev");
    await ctx.db.insert(connectedAccounts).values({ userId: dev.id, stripeAccountId: "acct_test_shared", status: "active" });
    const total = DASHBOARD_LIST_LIMIT + 3;
    const ids: string[] = [];
    for (let i = 0; i < total; i++) {
      const project = await seedProject(client, "proposal_selected", { title: `P${i}`, updatedAt: at(1000 - i) });
      const accepted = await seedProposal(project.id, "accepted", dev.id);
      await ctx.db.insert(proposalSelections).values({ projectId: project.id, proposalId: accepted.id, selectedBy: client.id });
      ids.push(project.id);
      if (i === total - 1) {
        const done = await seedAttempt(client.id, project.id, accepted.id, "completed_test", at(10));
        await seedTransfer(done, dev.id, "pending");
      }
    }
    const data = await getClientDashboard(client);
    expect(data.contractingTotal).toBe(total);
    expect(data.contracting).toHaveLength(DASHBOARD_LIST_LIMIT);
    expect(data.contracting[0].projectId).toBe(ids[total - 1]);
    expect(data.contracting[0].payment?.status).toBe("completed_test");
    expect(data.contracting[0].transfer).toEqual({ status: "pending", completedAt: null });
    expect(data.contracting[1].payment).toBeNull();
    expect(data.contracting[1].transfer).toBeNull();
    expect(data.pendingActions.length).toBeLessThanOrEqual(DASHBOARD_LIST_LIMIT);
  });

  it("omits an inconsistent project without accepted proposal and keeps the rest", async () => {
    const client = await seedUser("client");
    await seedProject(client, "proposal_selected", { title: "Broken" });
    await seedWinner(client, "proposal_selected", { title: "Fine" });
    const data = await getClientDashboard(client);
    expect(data.contracting.map((c) => c.title)).toEqual(["Fine"]);
    expect(data.contractingTotal).toBe(1);
    expect(data.counts.byStatus.proposal_selected).toBe(2);
  });

  it("is coherent with getProjectPaymentOverview (no attempt, pending, canceled, completed_test + transfer)", async () => {
    const client = await seedUser("client");
    const none = await seedWinner(client, "proposal_selected");
    const pending = await seedWinner(client, "proposal_selected");
    await seedAttempt(client.id, pending.project.id, pending.accepted.id, "pending", at(3));
    const canceled = await seedWinner(client, "proposal_selected", { payouts: "pending" });
    await seedAttempt(client.id, canceled.project.id, canceled.accepted.id, "canceled", at(3));
    const completed = await seedWinner(client, "proposal_selected", { payouts: "none" });
    await seedAttempt(client.id, completed.project.id, completed.accepted.id, "failed", at(40));
    const done = await seedAttempt(client.id, completed.project.id, completed.accepted.id, "completed_test", at(30));
    await seedTransfer(done, completed.dev.id, "pending");
    const paid = await seedWinner(client, "contracted");
    const paidAttempt = await seedAttempt(client.id, paid.project.id, paid.accepted.id, "completed_test", at(30));
    await seedTransfer(paidAttempt, paid.dev.id, "completed_test");

    const data = await getClientDashboard(client);
    for (const { project } of [none, pending, canceled, completed, paid]) {
      const overview = await getProjectPaymentOverview(client, project.id);
      const row = data.contracting.find((c) => c.projectId === project.id)!;
      expect(row.payment?.status).toBe(overview.attempt?.status);
      expect(row.transfer?.status).toBe(overview.transfer?.status);
      expect(row.developerPayoutsReady).toBe(overview.developerPayoutsReady);
    }
  });

  it("exposes exactly the explicit projection and nothing from other clients", async () => {
    const client = await seedUser("client");
    const other = await seedUser("client");
    const published = await seedProject(client, "published");
    await seedProposal(published.id, "pending");
    const { project, accepted } = await seedWinner(client, "proposal_selected", { name: "Visible Dev" });
    const attempt = await seedAttempt(client.id, project.id, accepted.id, "completed_test", at(5));
    await seedTransfer(attempt, accepted.developerId, "pending");
    await seedWinner(other, "proposal_selected", { name: "Hidden Dev", title: "Other client project" });

    const data = await getClientDashboard(client);
    expect(Object.keys(data).sort()).toEqual(["contracting", "contractingTotal", "counts", "pendingActions"]);
    expect(Object.keys(data.counts).sort()).toEqual(["byStatus", "total"]);
    expect(Object.keys(data.counts.byStatus).sort()).toEqual(
      ["closed", "contracted", "draft", "proposal_selected", "published"],
    );
    for (const action of data.pendingActions) {
      expect(Object.keys(action).sort()).toEqual(
        action.kind === "choose_proposal"
          ? ["kind", "pendingProposals", "projectId", "projectTitle"]
          : ["kind", "projectId", "projectTitle"],
      );
    }
    const [row] = data.contracting;
    expect(Object.keys(row).sort()).toEqual(
      ["amountCents", "developerId", "developerName", "developerPayoutsReady", "payment", "projectId", "rated", "status", "title", "transfer"],
    );
    expect(Object.keys(row.payment!).sort()).toEqual(["status", "updatedAt"]);
    expect(Object.keys(row.transfer!).sort()).toEqual(["completedAt", "status"]);
    const json = JSON.stringify(data);
    expect(json).not.toContain("cs_test_");
    expect(json).not.toContain("pi_test_");
    expect(json).not.toContain("@example.com");
    expect(json).not.toContain("Hidden Dev");
    expect(json).not.toContain("Other client project");
    expect(json).toContain("Visible Dev");
  });

  it("developer and admin get FORBIDDEN without touching the database", async () => {
    const developer = await seedUser("developer");
    const admin = await seedUser("admin");
    const spy = vi.spyOn(ctx.db, "select");
    await rejectsWith(getClientDashboard(developer), "FORBIDDEN");
    await rejectsWith(getClientDashboard(admin), "FORBIDDEN");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("never calls Stripe (getStripe throws and the dashboard is still computed)", async () => {
    const client = await seedUser("client");
    await seedWinner(client, "proposal_selected");
    await expect(getClientDashboard(client)).resolves.toBeDefined();
    expect(stripe.getStripe).not.toHaveBeenCalled();
  });
});
