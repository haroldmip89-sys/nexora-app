// @vitest-environment node
import { eq } from "drizzle-orm";
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
import { projects } from "@/modules/projects/schema/projects.table";
import * as projectService from "@/modules/projects/services/project.service";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";
import { ProposalError } from "./proposal-errors";
import * as service from "./proposal.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;

let client: AuthUser;
let otherClient: AuthUser;
let developer: AuthUser;
let otherDeveloper: AuthUser;
let admin: AuthUser;

async function seedUser(role: AuthUser["role"], payouts: "active" | "none" = "active"): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_p_${n}`, role, displayName: `User ${n}`, email: `p${n}@example.com` })
    .returning();
  if (role === "developer" && payouts === "active") {
    await ctx.db
      .insert(connectedAccounts)
      .values({ userId: row.id, stripeAccountId: `acct_test_${n}`, status: "active" });
  }
  return { id: row.id, clerkUserId: row.clerkUserId, role, displayName: row.displayName, email: row.email };
}

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  client = await seedUser("client");
  otherClient = await seedUser("client");
  developer = await seedUser("developer");
  otherDeveloper = await seedUser("developer");
  admin = await seedUser("admin");
});
afterAll(async () => {
  await ctx.client.close();
});

const input = (over: Partial<{ priceCents: number; timelineWeeks: number; description: string }> = {}) => ({
  priceCents: 150_000,
  timelineWeeks: 3,
  description: "I can build this project in the given time frame.",
  ...over,
});

async function seedProject(status: ProjectStatus = "published", owner: AuthUser = client) {
  const [row] = await ctx.db
    .insert(projects)
    .values({
      clientId: owner.id,
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
  return row;
}

async function seedProposal(
  projectId: string,
  dev: AuthUser,
  over: Partial<typeof proposals.$inferInsert> = {},
) {
  const [row] = await ctx.db
    .insert(proposals)
    .values({ projectId, developerId: dev.id, priceCents: 150_000, timelineWeeks: 3, description: "desc", ...over })
    .returning();
  return row;
}

const rowOf = async (id: string) =>
  (await ctx.db.select().from(proposals).where(eq(proposals.id, id)))[0];
const countFor = async (projectId: string) =>
  (await ctx.db.select().from(proposals).where(eq(proposals.projectId, projectId))).length;

async function rejectsWith(p: Promise<unknown>, code: string, cls: typeof ProposalError | typeof AuthError) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(cls);
  expect((err as { code: string }).code).toBe(code);
}

describe("createProposal", () => {
  it("rejects a developer without active payouts with PAYOUTS_NOT_READY and inserts nothing", async () => {
    const project = await seedProject();
    const noPayouts = await seedUser("developer", "none");
    await expect(service.createProposal(noPayouts, project.id, input())).rejects.toMatchObject({
      code: "PAYOUTS_NOT_READY",
    });
    expect(await service.hasActivePayouts(noPayouts)).toBe(false);
    expect(await service.hasActivePayouts(developer)).toBe(true);
    const rows = await ctx.db.select().from(proposals).where(eq(proposals.projectId, project.id));
    expect(rows).toHaveLength(0);
  });

  it("inserts a pending proposal for the actor on a published project (AC1)", async () => {
    const project = await seedProject();
    const result = await service.createProposal(developer, project.id, input());
    const row = await rowOf(result.id);
    expect(row).toMatchObject({
      projectId: project.id,
      developerId: developer.id,
      status: "pending",
      currency: "USD",
      withdrawnAt: null,
      priceCents: 150_000,
      timelineWeeks: 3,
    });
    expect(Object.keys(result).sort()).toEqual(
      ["createdAt", "description", "id", "priceCents", "projectId", "status", "timelineWeeks", "updatedAt", "withdrawnAt"],
    );
  });

  it("forbids client and admin without writing", async () => {
    const project = await seedProject();
    await rejectsWith(service.createProposal(client, project.id, input()), "FORBIDDEN", AuthError);
    await rejectsWith(service.createProposal(admin, project.id, input()), "FORBIDDEN", AuthError);
    expect(await countFor(project.id)).toBe(0);
  });

  it("role blocks a client-owned project case before anything else", async () => {
    const project = await seedProject("published", client);
    await rejectsWith(service.createProposal(client, project.id, input()), "FORBIDDEN", AuthError);
  });

  it("returns NOT_FOUND for draft and unknown projects (AC2)", async () => {
    const draft = await seedProject("draft");
    await rejectsWith(service.createProposal(developer, draft.id, input()), "NOT_FOUND", AuthError);
    await rejectsWith(
      service.createProposal(developer, "00000000-0000-4000-8000-000000000000", input()),
      "NOT_FOUND",
      AuthError,
    );
    expect(await countFor(draft.id)).toBe(0);
  });

  it.each(["proposal_selected", "contracted", "closed"] as const)(
    "returns PROJECT_NOT_OPEN for %s",
    async (status) => {
      const project = await seedProject(status);
      await rejectsWith(service.createProposal(developer, project.id, input()), "PROJECT_NOT_OPEN", ProposalError);
      expect(await countFor(project.id)).toBe(0);
    },
  );

  it("rejects duplicates and resend after withdrawing; other developers can propose (AC3)", async () => {
    const project = await seedProject();
    const first = await service.createProposal(developer, project.id, input());
    await rejectsWith(service.createProposal(developer, project.id, input()), "ALREADY_PROPOSED", ProposalError);
    await service.createProposal(otherDeveloper, project.id, input());
    expect(await countFor(project.id)).toBe(2);

    await service.withdrawProposal(developer, first.id);
    await rejectsWith(service.createProposal(developer, project.id, input()), "RESEND_NOT_ALLOWED", ProposalError);
    expect(await countFor(project.id)).toBe(2);
  });

  it("two simultaneous creates leave exactly one row (AC4)", async () => {
    const project = await seedProject();
    const results = await Promise.allSettled([
      service.createProposal(developer, project.id, input()),
      service.createProposal(developer, project.id, input()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((failed.reason as ProposalError).code).toBe("ALREADY_PROPOSED");
    expect(await countFor(project.id)).toBe(1);
  });

  it("create vs closeProject never leaves a pending proposal on a closed project (AC4)", async () => {
    const project = await seedProject();
    await Promise.allSettled([
      service.createProposal(developer, project.id, input()),
      projectService.closeProject(client, project.id),
    ]);
    const rows = await ctx.db.select().from(proposals).where(eq(proposals.projectId, project.id));
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(0);
    expect((await ctx.db.select().from(projects).where(eq(projects.id, project.id)))[0].status).toBe("closed");
  });

  it("create vs unpublishProject ends coherent (AC4)", async () => {
    const project = await seedProject();
    await Promise.allSettled([
      service.createProposal(developer, project.id, input()),
      projectService.unpublishProject(client, project.id),
    ]);
    const rows = await ctx.db.select().from(proposals).where(eq(proposals.projectId, project.id));
    const status = (await ctx.db.select().from(projects).where(eq(projects.id, project.id)))[0].status;
    if (status === "draft") expect(rows).toHaveLength(0);
    else {
      expect(status).toBe("published");
      expect(rows).toHaveLength(1);
    }
  });
});

describe("updateProposal", () => {
  it("changes only price, timeline and description of a pending proposal (AC5)", async () => {
    const project = await seedProject();
    const created = await service.createProposal(developer, project.id, input());
    const updated = await service.updateProposal(developer, created.id, input({ priceCents: 99_900, timelineWeeks: 5, description: "Updated description that is long enough." }));
    expect(updated).toMatchObject({ priceCents: 99_900, timelineWeeks: 5, status: "pending", projectId: project.id, withdrawnAt: null });
    const row = await rowOf(created.id);
    expect(row.developerId).toBe(developer.id);
    expect(row.description).toBe("Updated description that is long enough.");
  });

  it.each(["accepted", "rejected", "withdrawn"] as const)("INVALID_STATE on %s without writing", async (status) => {
    const project = await seedProject();
    const p = await seedProposal(project.id, developer, { status, withdrawnAt: status === "withdrawn" ? new Date() : null });
    await rejectsWith(service.updateProposal(developer, p.id, input({ priceCents: 1000 })), "INVALID_STATE", ProposalError);
    expect((await rowOf(p.id)).priceCents).toBe(150_000);
  });

  it("returns NOT_FOUND for foreign and unknown ids; FORBIDDEN for client/admin", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id, developer);
    await rejectsWith(service.updateProposal(otherDeveloper, p.id, input()), "NOT_FOUND", AuthError);
    await rejectsWith(service.updateProposal(developer, "00000000-0000-4000-8000-000000000000", input()), "NOT_FOUND", AuthError);
    await rejectsWith(service.updateProposal(client, p.id, input()), "FORBIDDEN", AuthError);
    await rejectsWith(service.updateProposal(admin, p.id, input()), "FORBIDDEN", AuthError);
  });
});

describe("withdrawProposal", () => {
  it("withdraws a pending proposal and sets withdrawnAt (AC6, AC8)", async () => {
    const project = await seedProject();
    const created = await service.createProposal(developer, project.id, input());
    await new Promise((r) => setTimeout(r, 5));
    const result = await service.withdrawProposal(developer, created.id);
    expect(result.status).toBe("withdrawn");
    expect(result.withdrawnAt).toBeInstanceOf(Date);
    expect(result.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());

    const rows = await ctx.db.select().from(proposals);
    for (const r of rows) expect(r.withdrawnAt !== null).toBe(r.status === "withdrawn");
  });

  it.each(["accepted", "rejected", "withdrawn"] as const)("INVALID_STATE on %s", async (status) => {
    const project = await seedProject();
    const p = await seedProposal(project.id, developer, { status, withdrawnAt: status === "withdrawn" ? new Date() : null });
    await rejectsWith(service.withdrawProposal(developer, p.id), "INVALID_STATE", ProposalError);
    expect((await rowOf(p.id)).status).toBe(status);
  });

  it("NOT_FOUND for foreign/unknown, FORBIDDEN for client/admin", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id, developer);
    await rejectsWith(service.withdrawProposal(otherDeveloper, p.id), "NOT_FOUND", AuthError);
    await rejectsWith(service.withdrawProposal(developer, "00000000-0000-4000-8000-000000000000"), "NOT_FOUND", AuthError);
    await rejectsWith(service.withdrawProposal(client, p.id), "FORBIDDEN", AuthError);
    await rejectsWith(service.withdrawProposal(admin, p.id), "FORBIDDEN", AuthError);
    expect((await rowOf(p.id)).status).toBe("pending");
  });

  it("update vs withdraw simultaneous ends coherent (AC7)", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id, developer);
    const results = await Promise.allSettled([
      service.updateProposal(developer, p.id, input({ priceCents: 5000 })),
      service.withdrawProposal(developer, p.id),
    ]);
    const row = await rowOf(p.id);
    expect(row.status).toBe("withdrawn");
    expect(row.withdrawnAt).not.toBeNull();
    for (const r of results) {
      if (r.status === "rejected") expect((r.reason as ProposalError).code).toBe("INVALID_STATE");
    }
  });
});

describe("developer reads", () => {
  it("getMyProposalForProject returns own proposal or null (AC10)", async () => {
    const project = await seedProject();
    expect(await service.getMyProposalForProject(developer, project.id)).toBeNull();
    const mine = await seedProposal(project.id, developer);
    await seedProposal(project.id, otherDeveloper);
    expect((await service.getMyProposalForProject(developer, project.id))?.id).toBe(mine.id);
    await rejectsWith(service.getMyProposalForProject(client, project.id), "FORBIDDEN", AuthError);
    await rejectsWith(service.getMyProposalForProject(admin, project.id), "FORBIDDEN", AuthError);
  });

  it("listMyProposals filters, orders, paginates and projects safely (AC10)", async () => {
    const dev = await seedUser("developer");
    const stranger = await seedUser("developer");
    const base = Date.parse("2026-01-01T00:00:00Z");
    for (let i = 0; i < 12; i++) {
      const project = await seedProject(i === 0 ? "closed" : "published");
      await seedProposal(project.id, dev, {
        status: i < 3 ? "rejected" : "pending",
        createdAt: new Date(base + i * 1000),
      });
    }
    await seedProposal((await seedProject()).id, stranger);

    const page1 = await service.listMyProposals(dev, {});
    expect(page1).toMatchObject({ total: 12, page: 1, pageSize: 10, totalPages: 2 });
    expect(page1.items).toHaveLength(10);
    const times = page1.items.map((i) => i.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(Object.keys(page1.items[0]).sort()).toEqual(
      ["createdAt", "id", "priceCents", "projectId", "projectStatus", "projectTitle", "status", "timelineWeeks", "updatedAt", "withdrawnAt"],
    );

    const page2 = await service.listMyProposals(dev, { page: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.items.at(-1)?.projectStatus).toBe("closed");

    const rejected = await service.listMyProposals(dev, { status: "rejected" });
    expect(rejected.total).toBe(3);

    const invalid = await service.listMyProposals(dev, { status: "bogus" as never, page: -3 });
    expect(invalid.page).toBe(1);
    expect(invalid.total).toBe(12);

    await rejectsWith(service.listMyProposals(client, {}), "FORBIDDEN", AuthError);
    await rejectsWith(service.listMyProposals(admin, {}), "FORBIDDEN", AuthError);
  });
});

describe("client reads", () => {
  it("listProjectProposals excludes withdrawn and exposes only whitelisted keys (AC11, AC12)", async () => {
    const project = await seedProject();
    const dev = await seedUser("developer");
    await seedProposal(project.id, dev);
    await seedProposal(project.id, otherDeveloper, { status: "withdrawn", withdrawnAt: new Date() });

    const page = await service.listProjectProposals(client, project.id);
    expect(page.total).toBe(1);
    expect(page.items[0].developerName).toBe(dev.displayName);
    expect(Object.keys(page.items[0]).sort()).toEqual(
      ["createdAt", "developerId", "developerName", "id", "imageUrl", "priceCents", "status", "timelineWeeks", "updatedAt"],
    );
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain(dev.email);
    expect(serialized).not.toContain(dev.clerkUserId);
    // The developer id is exposed on purpose (public profile link); nothing else about the user.
    expect(page.items[0].developerId).toBe(dev.id);
    expect(serialized).not.toContain(client.id);
  });

  it("orders by recent / price_asc / timeline_asc with stable ties and paginates by 20", async () => {
    const project = await seedProject();
    const base = Date.parse("2026-02-01T00:00:00Z");
    const specs = [
      { price: 300, weeks: 2 },
      { price: 100, weeks: 5 },
      { price: 100, weeks: 5 },
      { price: 200, weeks: 2 },
    ];
    const created: { id: string; price: number; weeks: number; at: number }[] = [];
    for (const [i, s] of specs.entries()) {
      const dev = await seedUser("developer");
      const p = await seedProposal(project.id, dev, {
        priceCents: s.price * 100,
        timelineWeeks: s.weeks,
        createdAt: new Date(i < 3 ? base : base + 1000),
      });
      created.push({ id: p.id, price: s.price, weeks: s.weeks, at: p.createdAt.getTime() });
    }

    const recent = (await service.listProjectProposals(client, project.id, { sort: "recent" })).items;
    const recentKeys = recent.map((i) => [i.createdAt.getTime(), i.id] as const);
    expect(recentKeys).toEqual([...recentKeys].sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : -1)));

    const price = (await service.listProjectProposals(client, project.id, { sort: "price_asc" })).items;
    expect(price.map((i) => i.priceCents)).toEqual([10_000, 10_000, 20_000, 30_000]);
    const tied = price.slice(0, 2);
    expect(tied[0].createdAt.getTime()).toBeGreaterThanOrEqual(tied[1].createdAt.getTime());

    const timeline = (await service.listProjectProposals(client, project.id, { sort: "timeline_asc" })).items;
    expect(timeline.map((i) => [i.timelineWeeks, i.priceCents])).toEqual([
      [2, 20_000],
      [2, 30_000],
      [5, 10_000],
      [5, 10_000],
    ]);

    const big = await seedProject();
    for (let i = 0; i < 21; i++) await seedProposal(big.id, await seedUser("developer"));
    const p1 = await service.listProjectProposals(client, big.id);
    expect(p1).toMatchObject({ total: 21, pageSize: 20, totalPages: 2 });
    expect(p1.items).toHaveLength(20);
    expect((await service.listProjectProposals(client, big.id, { page: 2 })).items).toHaveLength(1);
    expect((await service.listProjectProposals(client, big.id, { sort: "x" as never })).items).toHaveLength(20);
  });

  it("allows admin and owner; NOT_FOUND for foreign client or unknown project; FORBIDDEN for developer", async () => {
    const project = await seedProject();
    await seedProposal(project.id, developer);
    expect((await service.listProjectProposals(admin, project.id)).total).toBe(1);
    await rejectsWith(service.listProjectProposals(otherClient, project.id), "NOT_FOUND", AuthError);
    await rejectsWith(
      service.listProjectProposals(client, "00000000-0000-4000-8000-000000000000"),
      "NOT_FOUND",
      AuthError,
    );
    await rejectsWith(service.listProjectProposals(developer, project.id), "FORBIDDEN", AuthError);
    await rejectsWith(service.getProjectProposal(developer, project.id, "x"), "FORBIDDEN", AuthError);
  });

  it("getProjectProposal returns the exact detail keys; NOT_FOUND for other project, unknown or withdrawn", async () => {
    const project = await seedProject();
    const other = await seedProject();
    const dev = await seedUser("developer");
    const p = await seedProposal(project.id, dev);
    const w = await seedProposal(project.id, otherDeveloper, { status: "withdrawn", withdrawnAt: new Date() });
    const inOther = await seedProposal(other.id, dev);

    const detail = await service.getProjectProposal(client, project.id, p.id);
    expect(Object.keys(detail).sort()).toEqual(
      ["createdAt", "description", "developerId", "developerName", "id", "imageUrl", "priceCents", "status", "timelineWeeks", "updatedAt"],
    );
    expect(detail.developerName).toBe(dev.displayName);

    await rejectsWith(service.getProjectProposal(client, project.id, w.id), "NOT_FOUND", AuthError);
    await rejectsWith(service.getProjectProposal(client, project.id, inOther.id), "NOT_FOUND", AuthError);
    await rejectsWith(
      service.getProjectProposal(client, project.id, "00000000-0000-4000-8000-000000000000"),
      "NOT_FOUND",
      AuthError,
    );
    await rejectsWith(service.getProjectProposal(otherClient, project.id, p.id), "NOT_FOUND", AuthError);
  });
});
