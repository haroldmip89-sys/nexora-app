// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/test-db";
import { projects } from "@/modules/projects/schema/projects.table";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { users } from "@/modules/users/schema/users.table";
import { markContracted } from "./project-transitions";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let clientId: string;

async function seedProject(status: ProjectStatus) {
  const [row] = await ctx.db
    .insert(projects)
    .values({
      clientId,
      title: "Project",
      category: "Frontend & UI/UX",
      description: "A project description long enough.",
      budgetMinCents: 100_000,
      budgetMaxCents: 200_000,
      timelineWeeks: 4,
      status,
      publishedAt: status === "draft" ? null : new Date(),
      closedAt: status === "closed" ? new Date() : null,
    })
    .returning();
  return row.id;
}

const rowOf = async (id: string) =>
  (await ctx.db.select().from(projects).where(eq(projects.id, id)))[0];

beforeAll(async () => {
  ctx = await createTestDb();
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: "clerk_mc_1", role: "client", displayName: "Client", email: "mc1@example.com" })
    .returning();
  clientId = row.id;
});
afterAll(async () => {
  await ctx.client.close();
});

describe("markContracted", () => {
  it("moves proposal_selected to contracted, stamps contracted_at and keeps other columns", async () => {
    const id = await seedProject("proposal_selected");
    const before = await rowOf(id);
    expect(await markContracted(ctx.db, id)).toBe(true);
    const after = await rowOf(id);
    expect(after.status).toBe("contracted");
    expect(after.contractedAt).toBeInstanceOf(Date);
    const strip = ({ status, contractedAt, updatedAt, ...rest }: typeof before) => {
      void status;
      void contractedAt;
      void updatedAt;
      return rest;
    };
    expect(strip(after)).toEqual(strip(before));
  });

  it.each(["draft", "published", "contracted", "closed"] as const)(
    "returns false and changes nothing from %s",
    async (status) => {
      const id = await seedProject(status);
      const before = await rowOf(id);
      expect(await markContracted(ctx.db, id)).toBe(false);
      expect(await rowOf(id)).toEqual(before);
    },
  );

  it("returns false for an unknown project", async () => {
    expect(await markContracted(ctx.db, "00000000-0000-4000-8000-000000000000")).toBe(false);
  });

  it("works inside a transaction and rolls back with it", async () => {
    const id = await seedProject("proposal_selected");
    await expect(
      ctx.db.transaction(async (tx) => {
        expect(await markContracted(tx, id)).toBe(true);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    const row = await rowOf(id);
    expect(row.status).toBe("proposal_selected");
    expect(row.contractedAt).toBeNull();
  });
});
