// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

import { projectTechnologies } from "@/modules/projects/schema/project-technologies.table";
import { projects } from "@/modules/projects/schema/projects.table";
import { technologies } from "@/modules/projects/schema/technologies.table";
import { ProjectError } from "@/modules/projects/services/project-errors";
import { users } from "@/modules/users/schema/users.table";
import {
  getProjectTechnologySlugs,
  listTechnologies,
  replaceProjectTechnologies,
  resolveTechnologyIds,
} from "./technology.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let projectId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  const [user] = await ctx.db
    .insert(users)
    .values({ clerkUserId: "c_1", role: "client", displayName: "U", email: "u@example.com" })
    .returning();
  const [project] = await ctx.db
    .insert(projects)
    .values({
      clientId: user.id,
      title: "Some project",
      category: "Full Stack",
      description: "A description that is long enough.",
      budgetMinCents: 100,
      budgetMaxCents: 200,
      timelineWeeks: 4,
    })
    .returning();
  projectId = project.id;
});
afterAll(async () => {
  await ctx.client.close();
});

const replace = (slugs: string[]) =>
  ctx.db.transaction((tx) => replaceProjectTechnologies(tx as never, projectId, slugs));

const storedSlugs = async () =>
  (
    await ctx.db
      .select({ slug: technologies.slug })
      .from(projectTechnologies)
      .innerJoin(technologies, eq(technologies.id, projectTechnologies.technologyId))
      .where(eq(projectTechnologies.projectId, projectId))
  )
    .map((r) => r.slug)
    .sort();

describe("listTechnologies", () => {
  it("returns only slug and name ordered by sort_order, with otros last", async () => {
    const list = await listTechnologies();
    expect(list.length).toBeGreaterThanOrEqual(40);
    expect(Object.keys(list[0]).sort()).toEqual(["name", "slug"]);
    expect(list[list.length - 1]).toMatchObject({ slug: "otros" });

    const rows = await ctx.db.select({ slug: technologies.slug, order: technologies.sortOrder }).from(technologies);
    const orderBySlug = new Map(rows.map((r) => [r.slug, r.order]));
    const orders = list.map((t) => orderBySlug.get(t.slug)!);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe("resolveTechnologyIds", () => {
  it("resolves valid slugs and returns [] for none", async () => {
    expect(await resolveTechnologyIds(ctx.db, [])).toEqual([]);
    const ids = await resolveTechnologyIds(ctx.db, ["react", "go", "react"]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("throws INVALID_TECHNOLOGY when any slug does not exist", async () => {
    const err = await resolveTechnologyIds(ctx.db, ["react", "cobol-xyz"]).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProjectError);
    expect((err as ProjectError).code).toBe("INVALID_TECHNOLOGY");
  });
});

describe("replaceProjectTechnologies / getProjectTechnologySlugs", () => {
  it("replaces the tags without duplicating", async () => {
    await replace(["react", "go"]);
    expect(await storedSlugs()).toEqual(["go", "react"]);
    await replace(["go", "postgresql", "go"]);
    expect(await storedSlugs()).toEqual(["go", "postgresql"]);
  });

  it("keeps the previous tags when a slug is invalid", async () => {
    await expect(replace(["react", "nope-nope"])).rejects.toBeInstanceOf(
      ProjectError,
    );
    expect(await storedSlugs()).toEqual(["go", "postgresql"]);
  });

  it("returns slugs ordered like the catalog and [] for a project without tags", async () => {
    await replace(["postgresql", "otros", "javascript"]);
    expect(await getProjectTechnologySlugs(ctx.db, projectId)).toEqual(["javascript", "postgresql", "otros"]);
    await replace([]);
    expect(await getProjectTechnologySlugs(ctx.db, projectId)).toEqual([]);
  });
});
