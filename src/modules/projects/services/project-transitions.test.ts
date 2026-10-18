// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/test-db";
import { projects } from "@/modules/projects/schema/projects.table";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { users } from "@/modules/users/schema/users.table";
import { markProposalSelected } from "./project-transitions";

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

const statusOf = async (id: string) =>
  (await ctx.db.select({ s: projects.status }).from(projects).where(eq(projects.id, id)))[0].s;

beforeAll(async () => {
  ctx = await createTestDb();
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: "clerk_pt_1", role: "client", displayName: "Client", email: "pt1@example.com" })
    .returning();
  clientId = row.id;
});
afterAll(async () => {
  await ctx.client.close();
});

describe("markProposalSelected", () => {
  it("moves a published project to proposal_selected and returns true", async () => {
    const id = await seedProject("published");
    expect(await markProposalSelected(ctx.db, id)).toBe(true);
    expect(await statusOf(id)).toBe("proposal_selected");
  });

  it.each(["draft", "closed", "proposal_selected", "contracted"] as const)(
    "returns false and leaves a %s project unchanged",
    async (status) => {
      const id = await seedProject(status);
      expect(await markProposalSelected(ctx.db, id)).toBe(false);
      expect(await statusOf(id)).toBe(status);
    },
  );

  it("returns false for an unknown project", async () => {
    expect(await markProposalSelected(ctx.db, "00000000-0000-4000-8000-000000000000")).toBe(false);
  });

  it("does not touch other projects", async () => {
    const target = await seedProject("published");
    const other = await seedProject("published");
    expect(await markProposalSelected(ctx.db, target)).toBe(true);
    expect(await statusOf(other)).toBe("published");
  });

  it("works inside a transaction and rolls back with it", async () => {
    const id = await seedProject("published");
    await expect(
      ctx.db.transaction(async (tx) => {
        expect(await markProposalSelected(tx, id)).toBe(true);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await statusOf(id)).toBe("published");
  });
});
