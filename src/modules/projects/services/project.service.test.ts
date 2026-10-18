// @vitest-environment node
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

import { AuthError } from "@/modules/auth/services/auth-errors";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { projectTechnologies } from "@/modules/projects/schema/project-technologies.table";
import { projects } from "@/modules/projects/schema/projects.table";
import { technologies } from "@/modules/projects/schema/technologies.table";
import { ProjectError } from "@/modules/projects/services/project-errors";
import type { ProjectInput, ProjectStatus } from "@/modules/projects/types/project.types";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";
import * as service from "./project.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;

let client: AuthUser;
let otherClient: AuthUser;
let developer: AuthUser;
let admin: AuthUser;

async function seedUser(role: AuthUser["role"]): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_${n}`, role, displayName: `User ${n}`, email: `u${n}@example.com` })
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

const input = (over: Partial<ProjectInput> = {}): ProjectInput => ({
  title: "Landing page for a bakery",
  category: "Frontend & UI/UX",
  description: "We need a modern landing page for our bakery with a contact form.",
  budgetMinCents: 100_000,
  budgetMaxCents: 200_000,
  timelineWeeks: 4,
  technologies: ["react", "tailwind-css"],
  ...over,
});

const tagSlugsOf = async (projectId: string) =>
  (
    await ctx.db
      .select({ slug: technologies.slug })
      .from(projectTechnologies)
      .innerJoin(technologies, eq(technologies.id, projectTechnologies.technologyId))
      .where(eq(projectTechnologies.projectId, projectId))
  )
    .map((r) => r.slug)
    .sort();

async function seedProject(
  owner: AuthUser,
  status: ProjectStatus = "draft",
  over: Partial<typeof projects.$inferInsert> & { tags?: string[] } = {},
) {
  const { tags = ["react", "tailwind-css"], ...projectOver } = over;
  const { technologies: _unused, ...i } = input();
  void _unused;
  const [row] = await ctx.db
    .insert(projects)
    .values({
      clientId: owner.id,
      ...i,
      status,
      publishedAt: status === "draft" ? null : new Date(),
      closedAt: status === "closed" ? new Date() : null,
      ...projectOver,
    })
    .returning();
  if (tags.length > 0) {
    const ids = await ctx.db.select({ id: technologies.id }).from(technologies).where(inArray(technologies.slug, tags));
    await ctx.db.insert(projectTechnologies).values(ids.map((t) => ({ projectId: row.id, technologyId: t.id })));
  }
  return row;
}

async function seedProposal(projectId: string, status: "pending" | "accepted" | "rejected" | "withdrawn" = "pending") {
  const dev = await seedUser("developer");
  const [row] = await ctx.db
    .insert(proposals)
    .values({ projectId, developerId: dev.id, priceCents: 150_000, timelineWeeks: 3, description: "I can do it", status })
    .returning();
  return row;
}

async function seedPayment(projectId: string, proposalId: string, status: "pending" | "completed_test" | "failed" | "canceled") {
  await ctx.db.insert(paymentAttempts).values({
    projectId,
    proposalId,
    clientId: client.id,
    amountCents: 150_000,
    status,
    completedAt: status === "completed_test" ? new Date() : null,
  });
}

const statusOf = async (id: string) =>
  (await ctx.db.select().from(projects).where(eq(projects.id, id)))[0];

const rejectsWith = async (p: Promise<unknown>, code: string, cls: typeof ProjectError | typeof AuthError = ProjectError) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(cls);
  expect((err as { code: string }).code).toBe(code);
};

describe("createProject", () => {
  it("inserts a draft owned by the actor", async () => {
    const row = await service.createProject(client, input());
    expect(row).toMatchObject({
      clientId: client.id,
      status: "draft",
      currency: "USD",
      publishedAt: null,
      closedAt: null,
    });
    expect(row).not.toHaveProperty("technologies");
    expect(await tagSlugsOf(row.id)).toEqual(["react", "tailwind-css"]);
  });

  it("rolls back the project when a slug is not in the catalog", async () => {
    const before = (await ctx.db.select().from(projects)).length;
    await rejectsWith(service.createProject(client, input({ technologies: ["react", "cobol-xyz"] })), "INVALID_TECHNOLOGY");
    expect((await ctx.db.select().from(projects)).length).toBe(before);
  });

  it("inserts published with publishedAt when publish is true", async () => {
    const row = await service.createProject(client, input(), { publish: true });
    expect(row.status).toBe("published");
    expect(row.publishedAt).not.toBeNull();
  });

  it.each([["developer"], ["admin"]] as const)("rejects %s with FORBIDDEN and writes nothing", async (who) => {
    const actor = who === "developer" ? developer : admin;
    const before = await ctx.db.select().from(projects);
    await rejectsWith(service.createProject(actor, input()), "FORBIDDEN", AuthError);
    expect((await ctx.db.select().from(projects)).length).toBe(before.length);
  });
});

describe("updateProject", () => {
  it("changes every field in draft and keeps status/clientId", async () => {
    const p = await seedProject(client);
    const next = input({
      title: "Another title",
      category: "Full Stack",
      description: "A completely different description that is long enough.",
      budgetMinCents: 5_000,
      budgetMaxCents: 9_000,
      timelineWeeks: 10,
      technologies: ["go"],
    });
    const { technologies: nextTags, ...fields } = next;
    const row = await service.updateProject(client, p.id, next);
    expect(row).toMatchObject({ ...fields, status: "draft", clientId: client.id });
    expect(await tagSlugsOf(p.id)).toEqual(nextTags);
  });

  it("rolls back field changes and keeps the old tags on an invalid slug", async () => {
    const p = await seedProject(client);
    await rejectsWith(
      service.updateProject(client, p.id, input({ title: "Changed title ok", technologies: ["go", "cobol-xyz"] })),
      "INVALID_TECHNOLOGY",
    );
    expect((await statusOf(p.id)).title).toBe(p.title);
    expect(await tagSlugsOf(p.id)).toEqual(["react", "tailwind-css"]);
  });

  it("in published only changes title, description and technologies", async () => {
    const p = await seedProject(client, "published");
    const row = await service.updateProject(client, p.id, input({ title: "New title here", technologies: ["vuejs"] }));
    expect(row).toMatchObject({ title: "New title here", status: "published" });
    expect(await tagSlugsOf(p.id)).toEqual(["vuejs"]);
  });

  it.each([
    ["category", { category: "WordPress" as const }],
    ["budgetMinCents", { budgetMinCents: 100_001 }],
    ["budgetMaxCents", { budgetMaxCents: 300_000 }],
    ["timelineWeeks", { timelineWeeks: 5 }],
  ])("in published rejects a changed %s with LOCKED_FIELDS without writing", async (_n, over) => {
    const p = await seedProject(client, "published");
    await rejectsWith(service.updateProject(client, p.id, input({ title: "Changed title ok", ...over })), "LOCKED_FIELDS");
    expect((await statusOf(p.id)).title).toBe(p.title);
  });

  it("in published leaves the tags untouched when LOCKED_FIELDS is raised", async () => {
    const p = await seedProject(client, "published");
    await rejectsWith(
      service.updateProject(client, p.id, input({ category: "WordPress", technologies: ["go"] })),
      "LOCKED_FIELDS",
    );
    expect(await tagSlugsOf(p.id)).toEqual(["react", "tailwind-css"]);
  });

  it.each(["proposal_selected", "contracted", "closed"] as const)("rejects %s with INVALID_STATE", async (st) => {
    const p = await seedProject(client, st);
    await rejectsWith(service.updateProject(client, p.id, input()), "INVALID_STATE");
  });

  it("answers NOT_FOUND to a foreign client and to a missing id", async () => {
    const p = await seedProject(otherClient);
    await rejectsWith(service.updateProject(client, p.id, input()), "NOT_FOUND", AuthError);
    await rejectsWith(service.updateProject(client, crypto.randomUUID(), input()), "NOT_FOUND", AuthError);
  });

  it("rejects developer and admin with FORBIDDEN", async () => {
    const p = await seedProject(client);
    await rejectsWith(service.updateProject(developer, p.id, input()), "FORBIDDEN", AuthError);
    await rejectsWith(service.updateProject(admin, p.id, input()), "FORBIDDEN", AuthError);
  });
});

describe("publishProject", () => {
  it("moves draft to published with publishedAt", async () => {
    const p = await seedProject(client);
    const row = await service.publishProject(client, p.id);
    expect(row.status).toBe("published");
    expect(row.publishedAt).not.toBeNull();
  });

  it.each(["published", "proposal_selected", "contracted", "closed"] as const)("rejects %s with INVALID_STATE", async (st) => {
    const p = await seedProject(client, st);
    await rejectsWith(service.publishProject(client, p.id), "INVALID_STATE");
  });

  it("rejects a row that no longer satisfies the schema and keeps the draft", async () => {
    const p = await seedProject(client, "draft", { category: "Retired category" });
    await rejectsWith(service.publishProject(client, p.id), "INVALID_PROJECT");
    expect((await statusOf(p.id)).status).toBe("draft");
  });

  it("rejects a draft without tags with INVALID_PROJECT", async () => {
    const p = await seedProject(client, "draft", { tags: [] });
    await rejectsWith(service.publishProject(client, p.id), "INVALID_PROJECT");
    expect((await statusOf(p.id)).status).toBe("draft");
  });

  it("answers NOT_FOUND to foreign client; admin gets FORBIDDEN", async () => {
    const p = await seedProject(otherClient);
    await rejectsWith(service.publishProject(client, p.id), "NOT_FOUND", AuthError);
    await rejectsWith(service.publishProject(admin, p.id), "FORBIDDEN", AuthError);
  });

  it("concurrent calls: one wins, the other gets INVALID_STATE", async () => {
    const p = await seedProject(client);
    const results = await Promise.allSettled([
      service.publishProject(client, p.id),
      service.publishProject(client, p.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ProjectError);
    expect(failed.reason.code).toBe("INVALID_STATE");
    expect((await statusOf(p.id)).status).toBe("published");
  });
});

describe("unpublishProject", () => {
  it("moves published to draft and clears publishedAt", async () => {
    const p = await seedProject(client, "published");
    const row = await service.unpublishProject(client, p.id);
    expect(row.status).toBe("draft");
    expect(row.publishedAt).toBeNull();
  });

  it.each(["pending", "accepted", "rejected", "withdrawn"] as const)(
    "blocks with HAS_PROPOSALS when a %s proposal exists",
    async (pst) => {
      const p = await seedProject(client, "published");
      await seedProposal(p.id, pst);
      await rejectsWith(service.unpublishProject(client, p.id), "HAS_PROPOSALS");
      expect((await statusOf(p.id)).status).toBe("published");
    },
  );

  it.each(["draft", "proposal_selected", "contracted", "closed"] as const)("rejects %s with INVALID_STATE", async (st) => {
    const p = await seedProject(client, st);
    await rejectsWith(service.unpublishProject(client, p.id), "INVALID_STATE");
  });

  it("answers NOT_FOUND to a foreign client", async () => {
    const p = await seedProject(otherClient, "published");
    await rejectsWith(service.unpublishProject(client, p.id), "NOT_FOUND", AuthError);
    await rejectsWith(service.unpublishProject(admin, p.id), "FORBIDDEN", AuthError);
  });
});

describe("closeProject", () => {
  it("closes published and rejects only pending proposals", async () => {
    const p = await seedProject(client, "published");
    const pending = await seedProposal(p.id, "pending");
    const withdrawn = await seedProposal(p.id, "withdrawn");
    const row = await service.closeProject(client, p.id);
    expect(row.status).toBe("closed");
    expect(row.closedAt).not.toBeNull();
    const after = await ctx.db.select().from(proposals).where(eq(proposals.projectId, p.id));
    expect(after.find((x) => x.id === pending.id)?.status).toBe("rejected");
    expect(after.find((x) => x.id === withdrawn.id)?.status).toBe("withdrawn");
  });

  it("does not touch proposals of other projects", async () => {
    const p = await seedProject(client, "published");
    const other = await seedProject(client, "published");
    const otherProposal = await seedProposal(other.id, "pending");
    await service.closeProject(client, p.id);
    const [row] = await ctx.db.select().from(proposals).where(eq(proposals.id, otherProposal.id));
    expect(row.status).toBe("pending");
  });

  it("closes proposal_selected without payment attempts, or with failed/canceled ones", async () => {
    const p = await seedProject(client, "proposal_selected");
    const prop = await seedProposal(p.id, "accepted");
    await seedPayment(p.id, prop.id, "failed");
    await seedPayment(p.id, prop.id, "canceled");
    expect((await service.closeProject(client, p.id)).status).toBe("closed");
    const bare = await seedProject(client, "proposal_selected");
    expect((await service.closeProject(client, bare.id)).status).toBe("closed");
  });

  it.each(["pending", "completed_test"] as const)(
    "blocks proposal_selected with a %s payment (PAYMENT_IN_PROGRESS)",
    async (pay) => {
      const p = await seedProject(client, "proposal_selected");
      const prop = await seedProposal(p.id, "accepted");
      await seedPayment(p.id, prop.id, pay);
      await rejectsWith(service.closeProject(client, p.id), "PAYMENT_IN_PROGRESS");
      const row = await statusOf(p.id);
      expect(row.status).toBe("proposal_selected");
      expect(row.closedAt).toBeNull();
    },
  );

  it("closes contracted", async () => {
    const p = await seedProject(client, "contracted");
    expect((await service.closeProject(client, p.id)).status).toBe("closed");
  });

  it.each(["draft", "closed"] as const)("rejects %s with INVALID_STATE", async (st) => {
    const p = await seedProject(client, st);
    await rejectsWith(service.closeProject(client, p.id), "INVALID_STATE");
  });

  it("lets an admin close a foreign project", async () => {
    const p = await seedProject(client, "published");
    expect((await service.closeProject(admin, p.id)).status).toBe("closed");
  });

  it("answers NOT_FOUND to a foreign client and FORBIDDEN to a developer", async () => {
    const p = await seedProject(otherClient, "published");
    await rejectsWith(service.closeProject(client, p.id), "NOT_FOUND", AuthError);
    await rejectsWith(service.closeProject(developer, p.id), "FORBIDDEN", AuthError);
    expect((await statusOf(p.id)).status).toBe("published");
  });

  it("concurrent calls: one wins, the other gets INVALID_STATE", async () => {
    const p = await seedProject(client, "published");
    const results = await Promise.allSettled([
      service.closeProject(client, p.id),
      service.closeProject(admin, p.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason.code).toBe("INVALID_STATE");
    expect((await statusOf(p.id)).status).toBe("closed");
  });
});

describe("listMyProjects", () => {
  let owner: AuthUser;

  beforeAll(async () => {
    owner = await seedUser("client");
    // 12 projects with increasing creation dates; every 4th is published.
    for (let i = 0; i < 12; i++) {
      await seedProject(owner, i % 4 === 0 ? "published" : "draft", {
        title: `Project number ${String(i).padStart(2, "0")}`,
        createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
      });
    }
    await seedProject(otherClient, "draft", { title: "Foreign project" });
  });

  it("returns only the actor's projects, newest first, 10 per page", async () => {
    const page = await service.listMyProjects(owner, { status: "all", sort: "newest", page: 1 });
    expect(page).toMatchObject({ total: 12, page: 1, pageSize: 10, totalPages: 2 });
    expect(page.items).toHaveLength(10);
    expect(page.items[0].title).toBe("Project number 11");
    expect(page.items.every((i) => i.title !== "Foreign project")).toBe(true);
  });

  it("paginates and sorts oldest first", async () => {
    const page = await service.listMyProjects(owner, { status: "all", sort: "oldest", page: 2 });
    expect(page.items.map((i) => i.title)).toEqual(["Project number 10", "Project number 11"]);
  });

  it("filters by status", async () => {
    const page = await service.listMyProjects(owner, { status: "published", sort: "newest", page: 1 });
    expect(page.total).toBe(3);
    expect(page.items.every((i) => i.status === "published")).toBe(true);
  });

  it("falls back to defaults on invalid params and gives empty items past the end", async () => {
    const bad = await service.listMyProjects(owner, { status: "bogus", sort: "x", page: -3 } as never);
    expect(bad).toMatchObject({ page: 1, total: 12 });
    expect(bad.items[0].title).toBe("Project number 11");
    const past = await service.listMyProjects(owner, { status: "all", sort: "newest", page: 9 });
    expect(past.items).toEqual([]);
    expect(past.total).toBe(12);
  });

  it("includes the proposalCount", async () => {
    const p = await seedProject(owner, "published", { title: "With proposals", createdAt: new Date(Date.UTC(2027, 0, 1)) });
    await seedProposal(p.id, "pending");
    await seedProposal(p.id, "withdrawn");
    const page = await service.listMyProjects(owner, { status: "all", sort: "newest", page: 1 });
    expect(page.items[0]).toMatchObject({ id: p.id, proposalCount: 2 });
    expect(page.items[1].proposalCount).toBe(0);
  });

  it("gives an empty list to an admin and FORBIDDEN to a developer", async () => {
    expect((await service.listMyProjects(admin, { status: "all", sort: "newest", page: 1 })).total).toBe(0);
    await rejectsWith(service.listMyProjects(developer, { status: "all", sort: "newest", page: 1 }), "FORBIDDEN", AuthError);
  });
});

describe("getMyProject", () => {
  it("returns the row with proposalCount", async () => {
    const p = await seedProject(client, "published");
    await seedProposal(p.id);
    const detail = await service.getMyProject(client, p.id);
    expect(detail).toMatchObject({ id: p.id, title: p.title, proposalCount: 1 });
  });

  it("returns the current tag slugs", async () => {
    const p = await seedProject(client, "draft", { tags: ["postgresql", "react"] });
    const detail = await service.getMyProject(client, p.id);
    expect([...detail.technologies].sort()).toEqual(["postgresql", "react"]);
    const bare = await seedProject(client, "draft", { tags: [] });
    expect((await service.getMyProject(client, bare.id)).technologies).toEqual([]);
  });

  it("lets an admin read a foreign project", async () => {
    const p = await seedProject(client);
    expect((await service.getMyProject(admin, p.id)).proposalCount).toBe(0);
  });

  it("answers NOT_FOUND to a foreign client or missing id and FORBIDDEN to a developer", async () => {
    const p = await seedProject(otherClient);
    await rejectsWith(service.getMyProject(client, p.id), "NOT_FOUND", AuthError);
    await rejectsWith(service.getMyProject(client, crypto.randomUUID()), "NOT_FOUND", AuthError);
    await rejectsWith(service.getMyProject(developer, p.id), "FORBIDDEN", AuthError);
  });
});

describe("module surface (AC17)", () => {
  it("exports no function that writes proposal_selected or contracted", () => {
    expect(Object.keys(service).sort()).toEqual(
      [
        "PROJECT_PAGE_SIZE",
        "closeProject",
        "createProject",
        "getMyProject",
        "listMyProjects",
        "publishProject",
        "unpublishProject",
        "updateProject",
      ].sort(),
    );
  });
});
