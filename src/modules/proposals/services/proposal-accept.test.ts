// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/test-db";
import { projects } from "@/modules/projects/schema/projects.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";
import {
  PROPOSAL_ERROR_MESSAGES,
  PROPOSAL_ERROR_STATUS,
  PROPOSAL_SELECTION_ERROR_MESSAGES,
  type ProposalErrorCode,
} from "./proposal-errors";
import { acceptPendingProposal, rejectPendingProposals } from "./proposal-transitions";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
type Status = "pending" | "accepted" | "rejected" | "withdrawn";
let ctx: Ctx;
let seq = 0;
let clientId: string;

async function seedUser(role: "client" | "developer") {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_a_${n}`, role, displayName: `U ${n}`, email: `a${n}@example.com` })
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

async function seedProposal(projectId: string, status: Status) {
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

describe("acceptPendingProposal", () => {
  it("accepts a pending proposal of the project and returns true", async () => {
    const project = await seedProject();
    const id = await seedProposal(project, "pending");
    expect(await acceptPendingProposal(ctx.db, { proposalId: id, projectId: project })).toBe(true);
    expect(await statusOf(id)).toBe("accepted");
  });

  it.each(["withdrawn", "rejected", "accepted"] as const)(
    "returns false and changes nothing for a %s proposal",
    async (status) => {
      const project = await seedProject();
      const id = await seedProposal(project, status);
      expect(await acceptPendingProposal(ctx.db, { proposalId: id, projectId: project })).toBe(false);
      expect(await statusOf(id)).toBe(status);
    },
  );

  it("returns false for a proposal of another project", async () => {
    const project = await seedProject();
    const other = await seedProject();
    const id = await seedProposal(other, "pending");
    expect(await acceptPendingProposal(ctx.db, { proposalId: id, projectId: project })).toBe(false);
    expect(await statusOf(id)).toBe("pending");
  });

  it("returns false for an unknown proposal", async () => {
    const project = await seedProject();
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect(await acceptPendingProposal(ctx.db, { proposalId: unknown, projectId: project })).toBe(false);
  });

  it("does not touch sibling proposals", async () => {
    const project = await seedProject();
    const winner = await seedProposal(project, "pending");
    const sibling = await seedProposal(project, "pending");
    expect(await acceptPendingProposal(ctx.db, { proposalId: winner, projectId: project })).toBe(true);
    expect(await statusOf(sibling)).toBe("pending");
  });

  it("accept + rejectPendingProposals rejects only the others and keeps withdrawn", async () => {
    const project = await seedProject();
    const winner = await seedProposal(project, "pending");
    const loser = await seedProposal(project, "pending");
    const withdrawn = await seedProposal(project, "withdrawn");
    const previouslyRejected = await seedProposal(project, "rejected");
    const otherProject = await seedProject();
    const unrelated = await seedProposal(otherProject, "pending");

    await ctx.db.transaction(async (tx) => {
      expect(await acceptPendingProposal(tx, { proposalId: winner, projectId: project })).toBe(true);
      expect(await rejectPendingProposals(tx, project)).toBe(1);
    });

    expect(await statusOf(winner)).toBe("accepted");
    expect(await statusOf(loser)).toBe("rejected");
    expect(await statusOf(withdrawn)).toBe("withdrawn");
    expect(await statusOf(previouslyRejected)).toBe("rejected");
    expect(await statusOf(unrelated)).toBe("pending");
  });
});

describe("proposal error maps", () => {
  const codes = Object.keys(PROPOSAL_ERROR_STATUS) as ProposalErrorCode[];

  it("covers the seven domain codes with status 409", () => {
    expect([...codes].sort()).toEqual([
      "ALREADY_PROPOSED",
      "ALREADY_SELECTED",
      "INVALID_STATE",
      "PAYOUTS_NOT_READY",
      "PROJECT_NOT_OPEN",
      "PROPOSAL_CHANGED",
      "RESEND_NOT_ALLOWED",
    ]);
    for (const code of codes) expect(PROPOSAL_ERROR_STATUS[code]).toBe(409);
  });

  it.each(Object.keys(PROPOSAL_ERROR_STATUS))("has non-empty messages for %s in both maps", (code) => {
    expect(PROPOSAL_ERROR_MESSAGES[code as ProposalErrorCode]).toBeTruthy();
    expect(PROPOSAL_SELECTION_ERROR_MESSAGES[code as ProposalErrorCode]).toBeTruthy();
  });

  it("keeps the 007 wording of existing codes", () => {
    expect(PROPOSAL_ERROR_MESSAGES.PROJECT_NOT_OPEN).toBe("Este proyecto ya no admite propuestas.");
    expect(PROPOSAL_ERROR_MESSAGES.INVALID_STATE).toBe(
      "La propuesta ya no está pendiente y no se puede modificar.",
    );
  });
});
