// @vitest-environment node
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

import { parsePublicCatalogQuery } from "@/modules/projects/schemas/public-catalog.schema";
import { projects } from "@/modules/projects/schema/projects.table";
import { projectTechnologies } from "@/modules/projects/schema/project-technologies.table";
import { technologies } from "@/modules/projects/schema/technologies.table";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import type { PublicCatalogQuery } from "@/modules/projects/types/public-project.types";
import { users } from "@/modules/users/schema/users.table";
import { getPublicProject, isProjectOwner, listPublicProjects } from "./public-catalog.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let ownerId: string;
let otherId: string;
let seq = 0;

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  const rows = await ctx.db
    .insert(users)
    .values([
      { clerkUserId: "c_owner", role: "client", displayName: "Owner Secret", email: "owner@example.com" },
      { clerkUserId: "c_other", role: "client", displayName: "Other", email: "other@example.com" },
    ])
    .returning();
  ownerId = rows[0].id;
  otherId = rows[1].id;
});
afterAll(async () => {
  await ctx.client.close();
});

const q = (raw: Record<string, string | string[]> = {}): PublicCatalogQuery => parsePublicCatalogQuery(raw);

/** `tags` are slugs of the catalog seeded by the migrations. */
async function seed(
  over: Partial<typeof projects.$inferInsert> & { tags?: string[] } = {},
  status: ProjectStatus = "published",
) {
  const { tags = ["go"], ...projectOver } = over;
  const n = ++seq;
  const [row] = await ctx.db
    .insert(projects)
    .values({
      clientId: ownerId,
      title: `Project ${n}`,
      category: "Backend & APIs",
      description: `Description ${n}`,
      budgetMinCents: 100_000,
      budgetMaxCents: 200_000,
      timelineWeeks: 6,
      status,
      publishedAt: status === "draft" ? null : new Date(2026, 0, 1, 0, 0, n),
      closedAt: status === "closed" ? new Date() : null,
      ...projectOver,
    })
    .returning();
  if (tags.length > 0) {
    const rows = await ctx.db.select({ id: technologies.id }).from(technologies).where(inArray(technologies.slug, tags));
    await ctx.db.insert(projectTechnologies).values(rows.map((t) => ({ projectId: row.id, technologyId: t.id })));
  }
  return row;
}

async function wipe() {
  await ctx.db.delete(projects);
}

const titles = (page: { items: { title: string }[] }) => page.items.map((i) => i.title);

describe("visibility and projection", () => {
  it("lists only published projects", async () => {
    await wipe();
    const pub = await seed({ title: "Visible" });
    for (const s of ["draft", "proposal_selected", "contracted", "closed"] as const) {
      await seed({ title: `Hidden ${s}` }, s);
    }
    const page = await listPublicProjects(q());
    expect(titles(page)).toEqual(["Visible"]);
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe(pub.id);
  });

  it("exposes exactly the whitelisted keys", async () => {
    await wipe();
    const row = await seed({ description: "x".repeat(5000) });
    const page = await listPublicProjects(q());
    expect(Object.keys(page.items[0]).sort()).toEqual(
      [
        "id",
        "title",
        "category",
        "summary",
        "budgetMinCents",
        "budgetMaxCents",
        "timelineWeeks",
        "technologies",
        "publishedAt",
      ].sort(),
    );
    expect(page.items[0].summary.length).toBeLessThanOrEqual(240);

    const detail = await getPublicProject(row.id);
    expect(Object.keys(detail!).sort()).toEqual(
      [
        "id",
        "title",
        "category",
        "description",
        "budgetMinCents",
        "budgetMaxCents",
        "timelineWeeks",
        "technologies",
        "publishedAt",
      ].sort(),
    );
    expect(detail!.description).toHaveLength(5000);
    expect(JSON.stringify([page, detail])).not.toContain(ownerId);
  });
});

describe("markdown description", () => {
  it("returns a plain text summary in the list and the full Markdown in the detail", async () => {
    await wipe();
    const md = "## Hola **mundo**\n\n- [enlace](https://a.com) y `codigo`\n\n<script>alert(1)</script>";
    const row = await seed({ description: md });
    const [item] = (await listPublicProjects(q())).items;
    expect(item.summary).toContain("Hola mundo");
    expect(item.summary).not.toMatch(/[#*`\]\[<>]|\]\(/);
    expect((await getPublicProject(row.id))!.description).toBe(md);
  });

  it("summarizes exactly as Hola mundo and bounds long Markdown to 240", async () => {
    await wipe();
    await seed({ description: "## Hola **mundo**" });
    expect((await listPublicProjects(q())).items[0].summary).toBe("Hola mundo");
    await wipe();
    await seed({ description: "**palabra** ".repeat(400).slice(0, 5000) });
    expect((await listPublicProjects(q())).items[0].summary.length).toBeLessThanOrEqual(240);
  });

  it("keeps drafts out of the catalog", async () => {
    await wipe();
    await seed({ description: "## Draft **hidden**" }, "draft");
    expect((await listPublicProjects(q())).items).toEqual([]);
  });
});

describe("getPublicProject", () => {
  it("returns null for non published, unknown and malformed ids", async () => {
    await wipe();
    for (const s of ["draft", "proposal_selected", "contracted", "closed"] as const) {
      const row = await seed({}, s);
      expect(await getPublicProject(row.id)).toBeNull();
    }
    expect(await getPublicProject("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getPublicProject("not-a-uuid")).toBeNull();
    expect(await getPublicProject("new")).toBeNull();
  });
});

describe("filters", () => {
  it("filters by category and groups historical ones under Otros", async () => {
    await wipe();
    await seed({ title: "Front", category: "Frontend & UI/UX" });
    await seed({ title: "Back", category: "Backend & APIs" });
    await seed({ title: "Other", category: "Otros" });
    await seed({ title: "Legacy", category: "Categoria antigua" });
    expect(titles(await listPublicProjects(q({ category: "Frontend & UI/UX" })))).toEqual(["Front"]);
    expect(titles(await listPublicProjects(q({ category: "Otros" }))).sort()).toEqual(["Legacy", "Other"]);
    expect(await listPublicProjects(q())).toMatchObject({ total: 4 });
    expect((await listPublicProjects(q())).items.map((i) => i.category)).toContain("Categoria antigua");
  });

  it("filters by max budget and weeks", async () => {
    await wipe();
    await seed({ title: "Cheap", budgetMinCents: 50_000, budgetMaxCents: 100_000, timelineWeeks: 4 });
    await seed({ title: "Mid", budgetMinCents: 50_000, budgetMaxCents: 300_000, timelineWeeks: 8 });
    await seed({ title: "Big", budgetMinCents: 500_000, budgetMaxCents: 900_000, timelineWeeks: 26 });
    expect(titles(await listPublicProjects(q({ budgetMax: "3000" }))).sort()).toEqual(["Cheap", "Mid"]);
    expect(titles(await listPublicProjects(q({ budgetMax: "1000" })))).toEqual(["Cheap"]);
    expect(titles(await listPublicProjects(q({ weeks: "8" }))).sort()).toEqual(["Cheap", "Mid"]);
    expect(titles(await listPublicProjects(q({ weeks: "4" })))).toEqual(["Cheap"]);
  });

  it("combines filters with AND", async () => {
    await wipe();
    await seed({ title: "A", category: "Backend & APIs", budgetMaxCents: 100_000, timelineWeeks: 4, tags: ["rust"] });
    await seed({ title: "B", category: "Backend & APIs", budgetMaxCents: 900_000, timelineWeeks: 4 });
    await seed({ title: "C", category: "Otros", budgetMaxCents: 100_000, timelineWeeks: 4 });
    const page = await listPublicProjects(
      q({ category: "Backend & APIs", budgetMax: "2000", weeks: "8", q: "rust" }),
    );
    expect(titles(page)).toEqual(["A"]);
  });
});

describe("search", () => {
  it("matches title, description and technology case-insensitively", async () => {
    await wipe();
    await seed({ title: "Tienda Online", description: "plain", tags: ["go"] });
    await seed({ title: "Other", description: "Necesitamos un CHATBOT", tags: ["go"] });
    await seed({ title: "Third", description: "plain", tags: ["postgresql"] });
    expect(titles(await listPublicProjects(q({ q: "tienda" })))).toEqual(["Tienda Online"]);
    expect(titles(await listPublicProjects(q({ q: "chatbot" })))).toEqual(["Other"]);
    expect(titles(await listPublicProjects(q({ q: "postgres" })))).toEqual(["Third"]);
  });

  it("requires every term (AND) across any field", async () => {
    await wipe();
    await seed({ title: "Tienda Online", description: "plain", tags: ["react"] });
    await seed({ title: "Tienda fisica", description: "plain", tags: ["go"] });
    expect(titles(await listPublicProjects(q({ q: "tienda react" })))).toEqual(["Tienda Online"]);
    expect(await listPublicProjects(q({ q: "tienda cobol" }))).toMatchObject({ total: 0 });
  });

  it("treats % _ and \\ literally", async () => {
    await wipe();
    await seed({ title: "Growth 100% real" });
    await seed({ title: "Code 1005 items" });
    await seed({ title: "snake a_b case" });
    await seed({ title: "aXb letters" });
    await seed({ title: "path a\\b here" });
    expect(titles(await listPublicProjects(q({ q: "100%" })))).toEqual(["Growth 100% real"]);
    expect(titles(await listPublicProjects(q({ q: "%" })))).toEqual(["Growth 100% real"]);
    expect(titles(await listPublicProjects(q({ q: "a_b" })))).toEqual(["snake a_b case"]);
    expect(titles(await listPublicProjects(q({ q: "_" })))).toEqual(["snake a_b case"]);
    expect(titles(await listPublicProjects(q({ q: "a\\b" })))).toEqual(["path a\\b here"]);
    expect(titles(await listPublicProjects(q({ q: "\\" })))).toEqual(["path a\\b here"]);
  });

  it("is not altered by quotes or semicolons", async () => {
    await wipe();
    await seed({ title: "Safe" });
    const page = await listPublicProjects(q({ q: "'; drop table projects; --" }));
    expect(page.total).toBe(0);
    expect(await listPublicProjects(q())).toMatchObject({ total: 1 });
  });
});

describe("technologies", () => {
  it("projects tag names ordered by sort_order and name, [] without tags", async () => {
    await wipe();
    const tagged = await seed({ tags: ["postgresql", "otros", "react", "javascript"] });
    const bare = await seed({ tags: [] });
    const page = await listPublicProjects(q());
    const byId = new Map(page.items.map((i) => [i.id, i.technologies]));
    expect(byId.get(tagged.id)).toEqual(["JavaScript", "React", "PostgreSQL", "Otros"]);
    expect(byId.get(bare.id)).toEqual([]);
    expect((await getPublicProject(tagged.id))!.technologies).toEqual(["JavaScript", "React", "PostgreSQL", "Otros"]);
    expect((await getPublicProject(bare.id))!.technologies).toEqual([]);
  });

  it("filters by one tag", async () => {
    await wipe();
    await seed({ title: "R", tags: ["react"] });
    await seed({ title: "RP", tags: ["react", "postgresql"] });
    await seed({ title: "G", tags: ["go"] });
    expect(titles(await listPublicProjects(q({ tech: "react" }))).sort()).toEqual(["R", "RP"]);
  });

  it("requires all tags (AND) and counts total correctly", async () => {
    await wipe();
    await seed({ title: "R", tags: ["react"] });
    await seed({ title: "RP", tags: ["react", "postgresql"] });
    await seed({ title: "P", tags: ["postgresql"] });
    const page = await listPublicProjects(q({ tech: ["react", "postgresql"] }));
    expect(titles(page)).toEqual(["RP"]);
    expect(page).toMatchObject({ total: 1, totalPages: 1 });
    expect(page.items[0].technologies).toEqual(["React", "PostgreSQL"]);
  });

  it("returns nothing for an unknown slug, even combined with a known one", async () => {
    await wipe();
    await seed({ tags: ["react"] });
    expect(await listPublicProjects(q({ tech: "cobol-xyz" }))).toMatchObject({ total: 0, items: [] });
    expect(await listPublicProjects(q({ tech: ["react", "cobol-xyz"] }))).toMatchObject({ total: 0 });
  });

  it("combines with other filters, never exposes non published and paginates", async () => {
    await wipe();
    await seed({ title: "Hidden", tags: ["react"] }, "draft");
    await seed({ title: "Wrong cat", category: "Otros", tags: ["react"] });
    for (let i = 0; i < 13; i++) await seed({ title: `Ok${i}`, tags: ["react"], publishedAt: new Date(2026, 1, 1) });
    const filtered = await listPublicProjects(q({ tech: "react", category: "Backend & APIs" }));
    expect(filtered).toMatchObject({ total: 13, totalPages: 2 });
    expect(titles(filtered)).not.toContain("Hidden");
    expect(titles(filtered)).not.toContain("Wrong cat");
    const p2 = await listPublicProjects(q({ tech: "react", category: "Backend & APIs", page: "2" }));
    expect(p2.items).toHaveLength(1);
  });

  it("searches by tag name case-insensitively without duplicating rows", async () => {
    await wipe();
    await seed({ title: "Multi", description: "plain", tags: ["javascript", "java"] });
    await seed({ title: "None", description: "plain", tags: ["go"] });
    const page = await listPublicProjects(q({ q: "JAVA" }));
    expect(titles(page)).toEqual(["Multi"]);
    expect(page.total).toBe(1);
  });

  it("treats % in the term literally against tag names", async () => {
    await wipe();
    await seed({ tags: ["react"] });
    expect(await listPublicProjects(q({ q: "re%" }))).toMatchObject({ total: 0 });
  });
});

describe("sorting", () => {
  it("recent: publishedAt desc with id desc tiebreak", async () => {
    await wipe();
    const same = new Date(2026, 5, 1);
    const a = await seed({ title: "A", publishedAt: same });
    const b = await seed({ title: "B", publishedAt: same });
    await seed({ title: "Newest", publishedAt: new Date(2026, 6, 1) });
    const [hi, lo] = [a, b].sort((x, y) => (x.id < y.id ? 1 : -1));
    expect(titles(await listPublicProjects(q()))).toEqual(["Newest", hi.title, lo.title]);
  });

  it("budget sorts use budget_max with deterministic tiebreak", async () => {
    await wipe();
    await seed({ title: "Low", budgetMaxCents: 100_000 });
    await seed({ title: "High", budgetMaxCents: 900_000 });
    const t1 = await seed({ title: "Tie1", budgetMaxCents: 500_000, publishedAt: new Date(2026, 3, 1) });
    const t2 = await seed({ title: "Tie2", budgetMaxCents: 500_000, publishedAt: new Date(2026, 3, 1) });
    const tie = [t1, t2].sort((x, y) => (x.id < y.id ? 1 : -1)).map((r) => r.title);
    expect(titles(await listPublicProjects(q({ sort: "budget_asc" })))).toEqual(["Low", ...tie, "High"]);
    expect(titles(await listPublicProjects(q({ sort: "budget_desc" })))).toEqual(["High", ...tie, "Low"]);
  });
});

describe("pagination", () => {
  it("pages by 12 without repeating items and handles out of range", async () => {
    await wipe();
    for (let i = 0; i < 25; i++) await seed({ title: `P${i}`, publishedAt: new Date(2026, 0, 1) });
    const p1 = await listPublicProjects(q());
    const p2 = await listPublicProjects(q({ page: "2" }));
    const p3 = await listPublicProjects(q({ page: "3" }));
    expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([12, 12, 1]);
    expect(p1).toMatchObject({ total: 25, totalPages: 3, page: 1, pageSize: 12 });
    const ids = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(25);

    const out = await listPublicProjects(q({ page: "9" }));
    expect(out.items).toEqual([]);
    expect(out).toMatchObject({ total: 25, totalPages: 3, page: 9 });
  });

  it("returns empty page with zero totals when nothing matches", async () => {
    await wipe();
    expect(await listPublicProjects(q())).toMatchObject({ items: [], total: 0, totalPages: 0 });
  });
});

describe("isProjectOwner", () => {
  it("is true only for the owner", async () => {
    await wipe();
    const row = await seed();
    expect(await isProjectOwner(row.id, ownerId)).toBe(true);
    expect(await isProjectOwner(row.id, otherId)).toBe(false);
    expect(await isProjectOwner("00000000-0000-4000-8000-000000000000", ownerId)).toBe(false);
    expect(await isProjectOwner("nope", ownerId)).toBe(false);
  });
});
