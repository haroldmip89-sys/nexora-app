// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/test-db";
import { projects } from "@/modules/projects/schema/projects.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";
import { rejectPendingProposals } from "./proposal-transitions";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;
let clientId: string;

async function seedUser(role: "client" | "developer") {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_t_${n}`, role, displayName: `U ${n}`, email: `t${n}@example.com` })
    .returning();
  return row.id;
}

async function seedProject() {
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
      status: "published",
      publishedAt: new Date(),
    })
    .returning();
  return row.id;
}

async function seedProposal(projectId: string, status: "pending" | "accepted" | "rejected" | "withdrawn") {
  const developerId = await seedUser("developer");
  const [row] = await ctx.db
    .insert(proposals)
    .values({ projectId, developerId, priceCents: 1000, timelineWeeks: 2, description: "d", status })
    .returning();
  return row.id;
}

const statusOf = async (id: string) =>
  (await ctx.db.select({ s: proposals.status }).from(proposals).where(eq(proposals.id, id)))[0].s;

beforeAll(async () => {
  ctx = await createTestDb();
  clientId = await seedUser("client");
});
afterAll(async () => {
  await ctx.client.close();
});

describe("rejectPendingProposals", () => {
  it("rejects only pending proposals of the project and returns the count", async () => {
    const p1 = await seedProject();
    const p2 = await seedProject();
    const pending1 = await seedProposal(p1, "pending");
    const pending2 = await seedProposal(p1, "pending");
    const withdrawn = await seedProposal(p1, "withdrawn");
    const accepted = await seedProposal(p1, "accepted");
    const other = await seedProposal(p2, "pending");

    const count = await rejectPendingProposals(ctx.db, p1);

    expect(count).toBe(2);
    expect(await statusOf(pending1)).toBe("rejected");
    expect(await statusOf(pending2)).toBe("rejected");
    expect(await statusOf(withdrawn)).toBe("withdrawn");
    expect(await statusOf(accepted)).toBe("accepted");
    expect(await statusOf(other)).toBe("pending");
  });

  it("returns 0 when nothing is pending", async () => {
    const p = await seedProject();
    await seedProposal(p, "rejected");
    expect(await rejectPendingProposals(ctx.db, p)).toBe(0);
  });

  it("works inside a transaction and rolls back with it", async () => {
    const p = await seedProject();
    const id = await seedProposal(p, "pending");
    await expect(
      ctx.db.transaction(async (tx) => {
        expect(await rejectPendingProposals(tx, p)).toBe(1);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await statusOf(id)).toBe("pending");
  });
});
