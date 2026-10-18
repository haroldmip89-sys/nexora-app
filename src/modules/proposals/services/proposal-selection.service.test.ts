// @vitest-environment node
// NOTE: PGlite is single-connection and serializes transactions, so the Promise.allSettled tests below
// prove that the final state is coherent in any execution order. They do NOT demonstrate the real
// FOR UPDATE behavior under true concurrency (Neon/Postgres); that is validated by reading the SQL.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

const fault = vi.hoisted(() => ({ mode: "none" as "none" | "throw" | "false" }));
vi.mock("@/modules/projects/services/project-transitions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/projects/services/project-transitions")>();
  return {
    ...original,
    markProposalSelected: async (...args: Parameters<typeof original.markProposalSelected>) => {
      if (fault.mode === "throw") throw new Error("boom");
      if (fault.mode === "false") return false;
      return original.markProposalSelected(...args);
    },
  };
});

import { AuthError } from "@/modules/auth/services/auth-errors";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { projects } from "@/modules/projects/schema/projects.table";
import * as projectService from "@/modules/projects/services/project.service";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";
import { ProposalError } from "./proposal-errors";
import * as proposalService from "./proposal.service";
import { selectProposal } from "./proposal-selection.service";

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
    .values({ clerkUserId: `clerk_s_${n}`, role, displayName: `User ${n}`, email: `s${n}@example.com` })
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
beforeEach(() => {
  fault.mode = "none";
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
  dev?: AuthUser,
  over: Partial<typeof proposals.$inferInsert> = {},
) {
  const d = dev ?? (await seedUser("developer"));
  const [row] = await ctx.db
    .insert(proposals)
    .values({ projectId, developerId: d.id, priceCents: 150_000, timelineWeeks: 3, description: "desc", ...over })
    .returning();
  return { ...row, dev: d };
}

const proposalRow = async (id: string) =>
  (await ctx.db.select().from(proposals).where(eq(proposals.id, id)))[0];
const projectRow = async (id: string) =>
  (await ctx.db.select().from(projects).where(eq(projects.id, id)))[0];
const selectionsOf = async (projectId: string) =>
  ctx.db.select().from(proposalSelections).where(eq(proposalSelections.projectId, projectId));
const proposalsOf = async (projectId: string) =>
  ctx.db.select().from(proposals).where(eq(proposals.projectId, projectId));

const inputFor = (projectId: string, p: { id: string; updatedAt: Date }) => ({
  projectId,
  proposalId: p.id,
  seenUpdatedAt: p.updatedAt,
});

async function rejectsWith(p: Promise<unknown>, code: string, cls: typeof ProposalError | typeof AuthError) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(cls);
  expect((err as { code: string }).code).toBe(code);
}

async function snapshot(projectId: string) {
  return {
    project: await projectRow(projectId),
    proposals: (await proposalsOf(projectId)).sort((a, b) => a.id.localeCompare(b.id)),
    selections: await selectionsOf(projectId),
  };
}

/** Invariants AC2 / R10 for one project. */
async function expectCoherent(projectId: string) {
  const project = await projectRow(projectId);
  const selections = await selectionsOf(projectId);
  const rows = await proposalsOf(projectId);
  const accepted = rows.filter((r) => r.status === "accepted");
  expect(selections.length).toBeLessThanOrEqual(1);
  expect(accepted.length).toBeLessThanOrEqual(1);
  if (project.status === "proposal_selected" || project.status === "contracted") {
    expect(selections).toHaveLength(1);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].id).toBe(selections[0].proposalId);
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(0);
  } else {
    expect(selections).toHaveLength(0);
    expect(accepted).toHaveLength(0);
  }
}

describe("selectProposal - happy path", () => {
  it("selects the winner, rejects the other pending, keeps withdrawn/rejected and other projects (AC1, AC3)", async () => {
    const project = await seedProject();
    const winner = await seedProposal(project.id);
    const loser1 = await seedProposal(project.id);
    const loser2 = await seedProposal(project.id);
    const withdrawn = await seedProposal(project.id, undefined, { status: "withdrawn", withdrawnAt: new Date() });
    const rejected = await seedProposal(project.id, undefined, { status: "rejected" });

    const otherProject = await seedProject("published", otherClient);
    const foreign = await seedProposal(otherProject.id);

    const before = { withdrawn: await proposalRow(withdrawn.id), rejected: await proposalRow(rejected.id) };
    const result = await selectProposal(client, inputFor(project.id, winner));

    const [selection] = await selectionsOf(project.id);
    expect(selection).toMatchObject({ projectId: project.id, proposalId: winner.id, selectedBy: client.id });
    expect(result).toEqual({
      projectId: project.id,
      proposalId: winner.id,
      selectedAt: selection.selectedAt,
      alreadySelected: false,
    });
    expect((await projectRow(project.id)).status).toBe("proposal_selected");
    expect((await proposalRow(winner.id)).status).toBe("accepted");
    expect((await proposalRow(loser1.id)).status).toBe("rejected");
    expect((await proposalRow(loser2.id)).status).toBe("rejected");
    expect(await proposalRow(withdrawn.id)).toEqual(before.withdrawn);
    expect(await proposalRow(rejected.id)).toEqual(before.rejected);
    expect((await proposalRow(foreign.id)).status).toBe("pending");
    expect((await projectRow(otherProject.id)).status).toBe("published");
    expect(await selectionsOf(otherProject.id)).toHaveLength(0);
    await expectCoherent(project.id);
  });

  it("works with a single pending proposal", async () => {
    const project = await seedProject();
    const only = await seedProposal(project.id);
    const result = await selectProposal(client, inputFor(project.id, only));
    expect(result.alreadySelected).toBe(false);
    await expectCoherent(project.id);
  });
});

describe("selectProposal - version (AC4)", () => {
  it("accepts a never-edited proposal using the millisecond value read by drizzle", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id);
    // updated_at was written by the DB default (microseconds); drizzle reads milliseconds.
    await expect(selectProposal(client, inputFor(project.id, p))).resolves.toMatchObject({
      alreadySelected: false,
    });
  });

  it("throws PROPOSAL_CHANGED after the developer edits, without writing; the new version works", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id, developer);
    const other = await seedProposal(project.id);
    const stale = await proposalRow(p.id);
    await new Promise((r) => setTimeout(r, 5));
    await proposalService.updateProposal(developer, p.id, {
      priceCents: 120_000,
      timelineWeeks: 2,
      description: "I can build this project in the given time frame.",
    });
    const before = await snapshot(project.id);

    await rejectsWith(selectProposal(client, inputFor(project.id, stale)), "PROPOSAL_CHANGED", ProposalError);
    expect(await snapshot(project.id)).toEqual(before);

    const fresh = await proposalRow(p.id);
    await expect(selectProposal(client, inputFor(project.id, fresh))).resolves.toMatchObject({
      proposalId: p.id,
      alreadySelected: false,
    });
    expect((await proposalRow(other.id)).status).toBe("rejected");
  });

  it("detects a 1 ms difference", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id);
    const seen = new Date(p.updatedAt.getTime() + 1);
    await rejectsWith(
      selectProposal(client, { projectId: project.id, proposalId: p.id, seenUpdatedAt: seen }),
      "PROPOSAL_CHANGED",
      ProposalError,
    );
    expect((await proposalRow(p.id)).status).toBe("pending");
  });
});

describe("selectProposal - proposal and project state", () => {
  it("returns INVALID_STATE for a proposal withdrawn between view and selection (AC5)", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id, developer);
    const seen = await proposalRow(p.id);
    await proposalService.withdrawProposal(developer, p.id);
    const before = await snapshot(project.id);
    await rejectsWith(selectProposal(client, inputFor(project.id, seen)), "INVALID_STATE", ProposalError);
    expect(await snapshot(project.id)).toEqual(before);
  });

  it("returns INVALID_STATE for a rejected proposal (AC5)", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id, undefined, { status: "rejected" });
    await rejectsWith(selectProposal(client, inputFor(project.id, p)), "INVALID_STATE", ProposalError);
    expect(await selectionsOf(project.id)).toHaveLength(0);
  });

  it.each(["draft", "closed"] as const)("returns PROJECT_NOT_OPEN for a %s project (AC6)", async (status) => {
    const project = await seedProject(status);
    const p = await seedProposal(project.id);
    const before = await snapshot(project.id);
    await rejectsWith(selectProposal(client, inputFor(project.id, p)), "PROJECT_NOT_OPEN", ProposalError);
    expect(await snapshot(project.id)).toEqual(before);
  });

  it.each(["proposal_selected", "contracted"] as const)(
    "returns ALREADY_SELECTED for another proposal when the project is %s (AC6)",
    async (status) => {
      const project = await seedProject("published");
      const winner = await seedProposal(project.id);
      const other = await seedProposal(project.id);
      await selectProposal(client, inputFor(project.id, winner));
      if (status === "contracted") {
        await ctx.db.update(projects).set({ status: "contracted" }).where(eq(projects.id, project.id));
      }
      const before = await snapshot(project.id);
      await rejectsWith(
        selectProposal(client, inputFor(project.id, await proposalRow(other.id))),
        "ALREADY_SELECTED",
        ProposalError,
      );
      expect(await snapshot(project.id)).toEqual(before);
    },
  );
});

describe("selectProposal - idempotency (AC8)", () => {
  it("returns alreadySelected without writing and without checking the version", async () => {
    const project = await seedProject();
    const winner = await seedProposal(project.id);
    const first = await selectProposal(client, inputFor(project.id, winner));
    const before = await snapshot(project.id);

    const retry = await selectProposal(client, {
      projectId: project.id,
      proposalId: winner.id,
      seenUpdatedAt: new Date(0),
    });
    expect(retry).toEqual({ ...first, alreadySelected: true });
    expect(await snapshot(project.id)).toEqual(before);
  });

  it("returns PROJECT_NOT_OPEN when the project was closed after selecting", async () => {
    const project = await seedProject();
    const winner = await seedProposal(project.id);
    await selectProposal(client, inputFor(project.id, winner));
    await projectService.closeProject(client, project.id);
    await rejectsWith(
      selectProposal(client, inputFor(project.id, await proposalRow(winner.id))),
      "PROJECT_NOT_OPEN",
      ProposalError,
    );
  });
});

describe("selectProposal - authorization (AC7)", () => {
  it("returns NOT_FOUND for a foreign client, hiding the project", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id);
    const before = await snapshot(project.id);
    await rejectsWith(selectProposal(otherClient, inputFor(project.id, p)), "NOT_FOUND", AuthError);
    expect(await snapshot(project.id)).toEqual(before);
  });

  it("returns NOT_FOUND for an unknown project and unknown proposal", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id);
    const ghost = "00000000-0000-4000-8000-000000000000";
    await rejectsWith(selectProposal(client, { ...inputFor(ghost, p) }), "NOT_FOUND", AuthError);
    await rejectsWith(
      selectProposal(client, { projectId: project.id, proposalId: ghost, seenUpdatedAt: p.updatedAt }),
      "NOT_FOUND",
      AuthError,
    );
    expect((await projectRow(project.id)).status).toBe("published");
  });

  it("returns NOT_FOUND for a proposal of another project of the same client", async () => {
    const project = await seedProject();
    const otherOwn = await seedProject();
    const foreign = await seedProposal(otherOwn.id);
    await rejectsWith(selectProposal(client, inputFor(project.id, foreign)), "NOT_FOUND", AuthError);
    expect((await proposalRow(foreign.id)).status).toBe("pending");
    expect((await projectRow(project.id)).status).toBe("published");
  });

  it("forbids admin and developer before touching the DB, even when seeded as owners", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id);
    const ownedByDev = await seedProject("published", developer);
    const devOwned = await seedProposal(ownedByDev.id);
    const before = await snapshot(project.id);
    await rejectsWith(selectProposal(admin, inputFor(project.id, p)), "FORBIDDEN", AuthError);
    await rejectsWith(selectProposal(developer, inputFor(project.id, p)), "FORBIDDEN", AuthError);
    await rejectsWith(selectProposal(developer, inputFor(ownedByDev.id, devOwned)), "FORBIDDEN", AuthError);
    expect(await snapshot(project.id)).toEqual(before);
    expect((await projectRow(ownedByDev.id)).status).toBe("published");
  });
});

describe("selectProposal - atomicity (AC9, AC12)", () => {
  it.each(["throw", "false"] as const)("leaves no partial change when markProposalSelected fails (%s)", async (mode) => {
    const project = await seedProject();
    const winner = await seedProposal(project.id);
    await seedProposal(project.id);
    await seedProposal(project.id, undefined, { status: "withdrawn", withdrawnAt: new Date() });
    const before = await snapshot(project.id);

    fault.mode = mode;
    if (mode === "throw") {
      await expect(selectProposal(client, inputFor(project.id, winner))).rejects.toThrow("boom");
    } else {
      await rejectsWith(selectProposal(client, inputFor(project.id, winner)), "INVALID_STATE", ProposalError);
    }
    fault.mode = "none";

    const after = await snapshot(project.id);
    expect(after).toEqual(before);
    expect(after.selections).toHaveLength(0);
    expect(after.proposals.filter((r) => r.status === "pending")).toHaveLength(2);
    expect(after.project.status).toBe("published");

    // and the same request succeeds once the fault is gone
    await expect(selectProposal(client, inputFor(project.id, winner))).resolves.toMatchObject({
      alreadySelected: false,
    });
    await expectCoherent(project.id);
  });
});

describe("selectProposal - DB safety net (AC10)", () => {
  it("returns ALREADY_SELECTED and changes nothing when a selection row exists on a published project", async () => {
    const project = await seedProject();
    const seeded = await seedProposal(project.id);
    const wanted = await seedProposal(project.id);
    await ctx.db
      .insert(proposalSelections)
      .values({ projectId: project.id, proposalId: seeded.id, selectedBy: client.id });
    const before = await snapshot(project.id);
    await rejectsWith(selectProposal(client, inputFor(project.id, wanted)), "ALREADY_SELECTED", ProposalError);
    expect(await snapshot(project.id)).toEqual(before);
  });

  it("rejects direct inserts that would violate the one-winner invariant", async () => {
    const project = await seedProject();
    const a = await seedProposal(project.id);
    const b = await seedProposal(project.id);
    const foreign = await seedProposal((await seedProject("published", otherClient)).id);
    await ctx.db
      .insert(proposalSelections)
      .values({ projectId: project.id, proposalId: a.id, selectedBy: client.id });

    // second selection for the same project (UNIQUE project_id)
    await expect(
      ctx.db.insert(proposalSelections).values({ projectId: project.id, proposalId: b.id, selectedBy: client.id }),
    ).rejects.toThrow();
    // selection with a proposal of another project (composite FK)
    const lonely = await seedProject();
    await expect(
      ctx.db
        .insert(proposalSelections)
        .values({ projectId: lonely.id, proposalId: foreign.id, selectedBy: client.id }),
    ).rejects.toThrow();
    // second accepted proposal in the same project (partial unique index)
    await ctx.db.update(proposals).set({ status: "accepted" }).where(eq(proposals.id, a.id));
    await expect(
      ctx.db.update(proposals).set({ status: "accepted" }).where(eq(proposals.id, b.id)),
    ).rejects.toThrow();
  });
});

describe("selectProposal - concurrency (AC13, AC14; coherence only, see header note)", () => {
  it("two different proposals: exactly one wins, the other gets ALREADY_SELECTED", async () => {
    const project = await seedProject();
    const a = await seedProposal(project.id);
    const b = await seedProposal(project.id);
    const results = await Promise.allSettled([
      selectProposal(client, inputFor(project.id, a)),
      selectProposal(client, inputFor(project.id, b)),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ProposalError);
    expect((failed[0].reason as ProposalError).code).toBe("ALREADY_SELECTED");
    await expectCoherent(project.id);
  });

  it("the same proposal twice: both succeed (one idempotent) with a single selection", async () => {
    const project = await seedProject();
    const a = await seedProposal(project.id);
    await seedProposal(project.id);
    const results = await Promise.allSettled([
      selectProposal(client, inputFor(project.id, a)),
      selectProposal(client, inputFor(project.id, a)),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const flags = results.map((r) => (r as PromiseFulfilledResult<{ alreadySelected: boolean }>).value.alreadySelected);
    expect(flags.filter(Boolean)).toHaveLength(1);
    expect(await selectionsOf(project.id)).toHaveLength(1);
    await expectCoherent(project.id);
  });

  const domainCodes = ["PROJECT_NOT_OPEN", "INVALID_STATE", "PROPOSAL_CHANGED", "ALREADY_SELECTED", "HAS_PROPOSALS", "NOT_FOUND"];
  const allowed = (r: PromiseSettledResult<unknown>) =>
    r.status === "fulfilled" ||
    domainCodes.includes((r.reason as { code?: string }).code ?? "");

  it("vs withdrawProposal of the chosen proposal", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id, developer);
    await seedProposal(project.id);
    const seen = await proposalRow(p.id);
    const results = await Promise.allSettled([
      selectProposal(client, inputFor(project.id, seen)),
      proposalService.withdrawProposal(developer, p.id),
    ]);
    expect(results.every(allowed)).toBe(true);
    await expectCoherent(project.id);
    const row = await proposalRow(p.id);
    expect(["accepted", "withdrawn"]).toContain(row.status);
  });

  it("vs updateProposal of the chosen proposal", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id, developer);
    const seen = await proposalRow(p.id);
    const results = await Promise.allSettled([
      selectProposal(client, inputFor(project.id, seen)),
      proposalService.updateProposal(developer, p.id, {
        priceCents: 99_000,
        timelineWeeks: 2,
        description: "I can build this project in the given time frame.",
      }),
    ]);
    expect(results.every(allowed)).toBe(true);
    await expectCoherent(project.id);
  });

  it("vs createProposal on the same project", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id);
    const newcomer = await seedUser("developer");
    const results = await Promise.allSettled([
      selectProposal(client, inputFor(project.id, p)),
      proposalService.createProposal(newcomer, project.id, {
        priceCents: 140_000,
        timelineWeeks: 3,
        description: "I can build this project in the given time frame.",
      }),
    ]);
    expect(results.every(allowed)).toBe(true);
    await expectCoherent(project.id);
  });

  it("vs closeProject", async () => {
    const project = await seedProject();
    const p = await seedProposal(project.id);
    await seedProposal(project.id);
    const results = await Promise.allSettled([
      selectProposal(client, inputFor(project.id, p)),
      projectService.closeProject(client, project.id),
    ]);
    expect(results.every(allowed)).toBe(true);
    const status = (await projectRow(project.id)).status;
    expect(["proposal_selected", "closed"]).toContain(status);
    const rows = await proposalsOf(project.id);
    expect(rows.filter((r) => r.status === "pending")).toHaveLength(0);
    expect(rows.filter((r) => r.status === "accepted").length).toBeLessThanOrEqual(1);
    // closing after a successful selection is allowed (D2): the selection stays, the project is closed
    expect(await selectionsOf(project.id)).toHaveLength(results[0].status === "fulfilled" ? 1 : 0);
  });
});
