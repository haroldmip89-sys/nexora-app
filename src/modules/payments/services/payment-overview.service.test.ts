// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

import { AuthError } from "@/modules/auth/services/auth-errors";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { connectedAccounts } from "@/modules/payments/schema/connected-accounts.table";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { projects } from "@/modules/projects/schema/projects.table";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";
import { getProjectPaymentOverview } from "./payment-overview.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;
let client: AuthUser;
let otherClient: AuthUser;
let developer: AuthUser;
let admin: AuthUser;

async function seedUser(role: AuthUser["role"], displayName?: string): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_o_${n}`, role, displayName: displayName ?? `User ${n}`, email: `o${n}@example.com` })
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

async function seedProject(status: ProjectStatus, withWinner = true, payouts: "active" | "pending" | "none" = "active") {
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
      status,
      publishedAt: status === "draft" ? null : new Date(),
      closedAt: status === "closed" ? new Date() : null,
    })
    .returning();
  if (!withWinner) return project;
  const dev = await seedUser("developer", "Dana Developer");
  const other = await seedUser("developer");
  if (payouts !== "none") {
    await ctx.db.insert(connectedAccounts).values({
      userId: dev.id,
      stripeAccountId: `acct_test_${dev.id.slice(0, 8)}`,
      status: payouts,
    });
  }
  const [accepted] = await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: dev.id, priceCents: 150_000, timelineWeeks: 3, description: "d", status: "accepted" })
    .returning();
  await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: other.id, priceCents: 999_999, timelineWeeks: 9, description: "d", status: "rejected" });
  await ctx.db
    .insert(proposalSelections)
    .values({ projectId: project.id, proposalId: accepted.id, selectedBy: client.id });
  return project;
}

async function seedAttempt(
  projectId: string,
  status: "pending" | "failed" | "canceled" | "completed_test",
  createdAt: Date,
) {
  const [selection] = (await ctx.db.select().from(proposalSelections)).filter((s) => s.projectId === projectId);
  const [row] = await ctx.db.insert(paymentAttempts).values({
    projectId,
    proposalId: selection.proposalId,
    clientId: client.id,
    amountCents: 150_000,
    status,
    stripeCheckoutSessionId: `cs_test_${++seq}`,
    stripePaymentIntentId: status === "completed_test" ? `pi_test_${seq}` : null,
    completedAt: status === "completed_test" ? new Date() : null,
    createdAt,
  }).returning();
  return row;
}

async function seedTransfer(
  attempt: { id: string; proposalId: string },
  values: { status: "pending" | "failed" | "completed_test"; reason?: string },
) {
  const [proposal] = (await ctx.db.select().from(proposals)).filter((p) => p.id === attempt.proposalId);
  await ctx.db.insert(developerTransfers).values({
    paymentAttemptId: attempt.id,
    developerId: proposal.developerId,
    amountCents: 150_000,
    status: values.status,
    lastErrorCode: values.reason ?? null,
    stripeTransferId: values.status === "completed_test" ? `tr_test_${++seq}` : null,
    completedAt: values.status === "completed_test" ? new Date() : null,
  });
}

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

async function rejectsWith(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AuthError);
  expect((err as { code: string }).code).toBe(code);
}

describe("getProjectPaymentOverview", () => {
  it("without attempts: summary of the accepted proposal, canStart true", async () => {
    const project = await seedProject("proposal_selected");
    const overview = await getProjectPaymentOverview(client, project.id);
    expect(overview).toEqual({
      project: { id: project.id, title: "Landing page", status: "proposal_selected" },
      proposal: { developerId: expect.any(String), developerName: "Dana Developer", imageUrl: null, priceCents: 150_000, currency: "USD", timelineWeeks: 3 },
      attempt: null,
      canStart: true,
      developerPayoutsReady: true,
      canResume: false,
      transfer: null,
    });
  });

  it.each(["none", "pending"] as const)(
    "developer payouts %s: canStart false, developerPayoutsReady false",
    async (payouts) => {
      const project = await seedProject("proposal_selected", true, payouts);
      const overview = await getProjectPaymentOverview(client, project.id);
      expect(overview.developerPayoutsReady).toBe(false);
      expect(overview.canStart).toBe(false);
      expect(overview.canResume).toBe(false);
    },
  );

  it("pending: canResume true, canStart false", async () => {
    const project = await seedProject("proposal_selected");
    await seedAttempt(project.id, "pending", at(1));
    const overview = await getProjectPaymentOverview(client, project.id);
    expect(overview.attempt?.status).toBe("pending");
    expect(overview.canStart).toBe(false);
    expect(overview.canResume).toBe(true);
  });

  it.each(["canceled", "failed"] as const)("%s: canStart true, canResume false", async (status) => {
    const project = await seedProject("proposal_selected");
    await seedAttempt(project.id, status, at(1));
    const overview = await getProjectPaymentOverview(client, project.id);
    expect(overview.attempt?.status).toBe(status);
    expect(overview.canStart).toBe(true);
    expect(overview.canResume).toBe(false);
  });

  it("completed_test: renders without start nor resume", async () => {
    const project = await seedProject("proposal_selected");
    await seedAttempt(project.id, "completed_test", at(1));
    const overview = await getProjectPaymentOverview(client, project.id);
    expect(overview.attempt?.status).toBe("completed_test");
    expect(overview.canStart).toBe(false);
    expect(overview.canResume).toBe(false);
  });

  it("returns the most recent attempt by created_at", async () => {
    const project = await seedProject("proposal_selected");
    await seedAttempt(project.id, "canceled", at(30));
    await seedAttempt(project.id, "failed", at(20));
    await seedAttempt(project.id, "pending", at(5));
    expect((await getProjectPaymentOverview(client, project.id)).attempt?.status).toBe("pending");
  });

  it.each(["contracted", "closed"] as const)("%s project: neither canStart nor canResume", async (status) => {
    const project = await seedProject(status);
    await seedAttempt(project.id, "canceled", at(1));
    const overview = await getProjectPaymentOverview(client, project.id);
    expect(overview.project.status).toBe(status);
    expect(overview.canStart).toBe(false);
    expect(overview.canResume).toBe(false);
  });

  it("exposes only the explicit projection (no Stripe ids, ids of people, email)", async () => {
    const project = await seedProject("proposal_selected");
    await seedAttempt(project.id, "pending", at(1));
    const overview = await getProjectPaymentOverview(client, project.id);
    expect(Object.keys(overview).sort()).toEqual(["attempt", "canResume", "canStart", "developerPayoutsReady", "project", "proposal", "transfer"]);
    expect(Object.keys(overview.project).sort()).toEqual(["id", "status", "title"]);
    expect(Object.keys(overview.proposal).sort()).toEqual(["currency", "developerId", "developerName", "imageUrl", "priceCents", "timelineWeeks"]);
    expect(Object.keys(overview.attempt!).sort()).toEqual(["amountCents", "createdAt", "status", "updatedAt"]);
    const json = JSON.stringify(overview);
    expect(json).not.toContain("cs_test_");
    expect(json).not.toContain("@example.com");
  });

  it("transfer is null without a row, then exposes exactly status, completedAt and reason", async () => {
    const project = await seedProject("proposal_selected");
    const attempt = await seedAttempt(project.id, "completed_test", at(30));
    expect((await getProjectPaymentOverview(client, project.id)).transfer).toBeNull();
    await seedTransfer(attempt, { status: "pending", reason: "ACCOUNT_NOT_ACTIVE" });
    const overview = await getProjectPaymentOverview(client, project.id);
    expect(overview.transfer).toEqual({ status: "pending", completedAt: null, reason: "ACCOUNT_NOT_ACTIVE" });
    expect(Object.keys(overview.transfer!).sort()).toEqual(["completedAt", "reason", "status"]);
  });

  it("completed transfer exposes completedAt and no Stripe ids", async () => {
    const project = await seedProject("proposal_selected");
    const attempt = await seedAttempt(project.id, "completed_test", at(10));
    await seedTransfer(attempt, { status: "completed_test" });
    const overview = await getProjectPaymentOverview(client, project.id);
    expect(overview.transfer?.status).toBe("completed_test");
    expect(overview.transfer?.completedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(overview)).not.toContain("tr_test_");
  });

  it("foreign client, unknown project and project without winner get NOT_FOUND", async () => {
    const project = await seedProject("proposal_selected");
    await rejectsWith(getProjectPaymentOverview(otherClient, project.id), "NOT_FOUND");
    await rejectsWith(getProjectPaymentOverview(client, "00000000-0000-4000-8000-000000000000"), "NOT_FOUND");
    const published = await seedProject("published", false);
    await rejectsWith(getProjectPaymentOverview(client, published.id), "NOT_FOUND");
    const draft = await seedProject("draft", false);
    await rejectsWith(getProjectPaymentOverview(client, draft.id), "NOT_FOUND");
  });

  it("developer and admin get FORBIDDEN", async () => {
    const project = await seedProject("proposal_selected");
    await rejectsWith(getProjectPaymentOverview(developer, project.id), "FORBIDDEN");
    await rejectsWith(getProjectPaymentOverview(admin, project.id), "FORBIDDEN");
  });

  it("does not write to the database", async () => {
    const project = await seedProject("proposal_selected");
    await getProjectPaymentOverview(client, project.id);
    expect(await ctx.db.select().from(paymentAttempts)).not.toContainEqual(
      expect.objectContaining({ projectId: project.id }),
    );
  });
});
