// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

async function createUser(role: string): Promise<string> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into users (clerk_user_id, role, display_name, email) values ($1, $2, 'Name', 'a@b.com') returning id`,
    [`clerk_dr_${++seq}`, role],
  );
  return rows[0].id;
}

/** A contracted project with its accepted proposal. */
async function createProjectWithProposal(): Promise<{ projectId: string; proposalId: string }> {
  const clientId = await createUser("client");
  const developerId = await createUser("developer");
  const project = await ctx.client.query<{ id: string }>(
    `insert into projects (client_id, title, category, description, budget_min_cents, budget_max_cents, timeline_weeks)
     values ($1, 't', 'web', 'd', 100, 100, 1) returning id`,
    [clientId],
  );
  const projectId = project.rows[0].id;
  const proposal = await ctx.client.query<{ id: string }>(
    `insert into proposals (project_id, developer_id, price_cents, timeline_weeks, description)
     values ($1, $2, 100, 1, 'd') returning id`,
    [projectId, developerId],
  );
  return { projectId, proposalId: proposal.rows[0].id };
}

const insert = (projectId: string, proposalId: string, rating: number, comment: string | null = null) =>
  ctx.client.query(
    `insert into developer_ratings (project_id, proposal_id, rating, comment) values ($1, $2, $3, $4)`,
    [projectId, proposalId, rating, comment],
  );

describe("developer_ratings constraints", () => {
  it("accepts ratings 1 and 5 and rejects 0 and 6", async () => {
    const a = await createProjectWithProposal();
    const b = await createProjectWithProposal();
    await expect(insert(a.projectId, a.proposalId, 1)).resolves.toBeDefined();
    await expect(insert(b.projectId, b.proposalId, 5)).resolves.toBeDefined();
    const c = await createProjectWithProposal();
    await expect(insert(c.projectId, c.proposalId, 0)).rejects.toThrow(/check constraint/i);
    await expect(insert(c.projectId, c.proposalId, 6)).rejects.toThrow(/check constraint/i);
  });

  it("accepts a 600-char comment and rejects 601", async () => {
    const a = await createProjectWithProposal();
    await expect(insert(a.projectId, a.proposalId, 3, "x".repeat(600))).resolves.toBeDefined();
    const b = await createProjectWithProposal();
    await expect(insert(b.projectId, b.proposalId, 3, "x".repeat(601))).rejects.toThrow(
      /check constraint/i,
    );
  });

  it("rejects an empty comment and accepts NULL", async () => {
    const a = await createProjectWithProposal();
    await expect(insert(a.projectId, a.proposalId, 3, "")).rejects.toThrow(/check constraint/i);
    await expect(insert(a.projectId, a.proposalId, 3, null)).resolves.toBeDefined();
  });

  it("rejects a second rating for the same project", async () => {
    const a = await createProjectWithProposal();
    await insert(a.projectId, a.proposalId, 4);
    await expect(insert(a.projectId, a.proposalId, 5)).rejects.toThrow();
  });

  it("rejects a proposal_id from another project (composite FK)", async () => {
    const a = await createProjectWithProposal();
    const b = await createProjectWithProposal();
    await expect(insert(a.projectId, b.proposalId, 4)).rejects.toThrow(/foreign key/i);
  });

  it("rejects deleting a project that has a rating (restrict)", async () => {
    const a = await createProjectWithProposal();
    await insert(a.projectId, a.proposalId, 4);
    await expect(
      ctx.client.query(`delete from projects where id = $1`, [a.projectId]),
    ).rejects.toThrow();
  });
});
