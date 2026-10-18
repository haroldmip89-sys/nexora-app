import "server-only";
import { and, asc, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { requireOwnership } from "@/modules/auth/services/current-user.service";
import { can } from "@/modules/auth/services/permissions";
import type { Action, AuthUser } from "@/modules/auth/types/auth.types";
import { projects } from "@/modules/projects/schema/projects.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import {
  myProposalsQuerySchema,
  projectProposalsQuerySchema,
} from "@/modules/proposals/schemas/proposal.schema";
import { ProposalError } from "@/modules/proposals/services/proposal-errors";
import type {
  ClientProposalDetail,
  ClientProposalSummary,
  DeveloperProposal,
  DeveloperProposalListItem,
  MyProposalsPage,
  MyProposalsQuery,
  ProjectProposalsPage,
  ProjectProposalsQuery,
  ProposalInput,
} from "@/modules/proposals/types/proposal.types";
import { users } from "@/modules/users/schema/users.table";

export const MY_PROPOSALS_PAGE_SIZE = 10;
export const PROJECT_PROPOSALS_PAGE_SIZE = 20;

function assertCan(actor: AuthUser, action: Action): void {
  if (!can(actor.role, action)) throw new AuthError("FORBIDDEN");
}

/** "My proposals" only makes sense for the author. */
function assertDeveloperReader(actor: AuthUser): void {
  assertCan(actor, "proposal.read");
  if (actor.role !== "developer") throw new AuthError("FORBIDDEN");
}

/** Owner client or admin (read); a developer never reads other developers' proposals. */
function assertProjectReader(actor: AuthUser): void {
  assertCan(actor, "proposal.read");
  if (actor.role === "developer") throw new AuthError("FORBIDDEN");
}

// Explicit whitelist: never `select()` / `returning()` raw towards callers.
const developerProposalColumns = {
  id: proposals.id,
  projectId: proposals.projectId,
  status: proposals.status,
  priceCents: proposals.priceCents,
  timelineWeeks: proposals.timelineWeeks,
  description: proposals.description,
  createdAt: proposals.createdAt,
  updatedAt: proposals.updatedAt,
  withdrawnAt: proposals.withdrawnAt,
};

const clientSummaryColumns = {
  id: proposals.id,
  developerName: users.displayName,
  priceCents: proposals.priceCents,
  timelineWeeks: proposals.timelineWeeks,
  status: proposals.status,
  createdAt: proposals.createdAt,
  updatedAt: proposals.updatedAt,
};

export async function createProposal(
  actor: AuthUser,
  projectId: string,
  input: ProposalInput,
): Promise<DeveloperProposal> {
  assertCan(actor, "proposal.create");
  return db.transaction(async (tx) => {
    // FOR SHARE conflicts with the FOR UPDATE of unpublish/close: no pending proposal on a non-published project.
    const [project] = await tx
      .select({ id: projects.id, status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
      .for("share");
    if (!project || project.status === "draft") throw new AuthError("NOT_FOUND");
    if (project.status !== "published") throw new ProposalError("PROJECT_NOT_OPEN");

    const [row] = await tx
      .insert(proposals)
      .values({
        projectId,
        developerId: actor.id,
        priceCents: input.priceCents,
        timelineWeeks: input.timelineWeeks,
        description: input.description,
      })
      .onConflictDoNothing({ target: [proposals.projectId, proposals.developerId] })
      .returning(developerProposalColumns);
    if (row) return row;

    const [existing] = await tx
      .select({ status: proposals.status })
      .from(proposals)
      .where(and(eq(proposals.projectId, projectId), eq(proposals.developerId, actor.id)))
      .limit(1);
    throw new ProposalError(existing?.status === "withdrawn" ? "RESEND_NOT_ALLOWED" : "ALREADY_PROPOSED");
  });
}

/** Unknown id and foreign id are indistinguishable: both NOT_FOUND. */
async function assertAuthor(actor: AuthUser, proposalId: string): Promise<void> {
  const [row] = await db
    .select({ developerId: proposals.developerId })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!row || row.developerId !== actor.id) throw new AuthError("NOT_FOUND");
}

export async function updateProposal(
  actor: AuthUser,
  proposalId: string,
  input: ProposalInput,
): Promise<DeveloperProposal> {
  assertCan(actor, "proposal.create");
  await assertAuthor(actor, proposalId);

  const [row] = await db
    .update(proposals)
    .set({
      priceCents: input.priceCents,
      timelineWeeks: input.timelineWeeks,
      description: input.description,
    })
    .where(
      and(
        eq(proposals.id, proposalId),
        eq(proposals.developerId, actor.id),
        eq(proposals.status, "pending"),
      ),
    )
    .returning(developerProposalColumns);
  if (!row) throw new ProposalError("INVALID_STATE");
  return row;
}

export async function withdrawProposal(actor: AuthUser, proposalId: string): Promise<DeveloperProposal> {
  assertCan(actor, "proposal.withdraw");
  await assertAuthor(actor, proposalId);

  const [row] = await db
    .update(proposals)
    .set({ status: "withdrawn", withdrawnAt: new Date() })
    .where(
      and(
        eq(proposals.id, proposalId),
        eq(proposals.developerId, actor.id),
        eq(proposals.status, "pending"),
      ),
    )
    .returning(developerProposalColumns);
  if (!row) throw new ProposalError("INVALID_STATE");
  return row;
}

export async function listMyProposals(
  actor: AuthUser,
  query: Partial<MyProposalsQuery> = {},
): Promise<MyProposalsPage> {
  assertDeveloperReader(actor);
  const { status, page } = myProposalsQuerySchema.parse(query);

  const where = and(
    eq(proposals.developerId, actor.id),
    status === "all" ? undefined : eq(proposals.status, status),
  );

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(proposals)
    .where(where);

  const { description: _description, ...listColumns } = developerProposalColumns;
  void _description;
  const items: DeveloperProposalListItem[] = await db
    .select({ ...listColumns, projectTitle: projects.title, projectStatus: projects.status })
    .from(proposals)
    .innerJoin(projects, eq(projects.id, proposals.projectId))
    .where(where)
    .orderBy(desc(proposals.createdAt), desc(proposals.id))
    .limit(MY_PROPOSALS_PAGE_SIZE)
    .offset((page - 1) * MY_PROPOSALS_PAGE_SIZE);

  return {
    items,
    total,
    page,
    pageSize: MY_PROPOSALS_PAGE_SIZE,
    totalPages: Math.ceil(total / MY_PROPOSALS_PAGE_SIZE),
  };
}

export async function getMyProposalForProject(
  actor: AuthUser,
  projectId: string,
): Promise<DeveloperProposal | null> {
  assertDeveloperReader(actor);
  const [row] = await db
    .select(developerProposalColumns)
    .from(proposals)
    .where(and(eq(proposals.projectId, projectId), eq(proposals.developerId, actor.id)))
    .limit(1);
  return row ?? null;
}

async function assertProjectOwner(actor: AuthUser, projectId: string): Promise<void> {
  const [project] = await db
    .select({ clientId: projects.clientId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new AuthError("NOT_FOUND");
  requireOwnership(actor, project.clientId, { allowAdmin: true });
}

function projectProposalsOrder(sort: ProjectProposalsQuery["sort"]): SQL[] {
  switch (sort) {
    case "price_asc":
      return [asc(proposals.priceCents), desc(proposals.createdAt), desc(proposals.id)];
    case "timeline_asc":
      return [asc(proposals.timelineWeeks), asc(proposals.priceCents), desc(proposals.id)];
    default:
      return [desc(proposals.createdAt), desc(proposals.id)];
  }
}

export async function listProjectProposals(
  actor: AuthUser,
  projectId: string,
  query: Partial<ProjectProposalsQuery> = {},
): Promise<ProjectProposalsPage> {
  assertProjectReader(actor);
  await assertProjectOwner(actor, projectId);
  const { sort, page } = projectProposalsQuerySchema.parse(query);

  // A withdrawn proposal is not an offer: never shown to the client.
  const where = and(eq(proposals.projectId, projectId), ne(proposals.status, "withdrawn"));

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(proposals)
    .where(where);

  const items: ClientProposalSummary[] = await db
    .select(clientSummaryColumns)
    .from(proposals)
    .innerJoin(users, eq(users.id, proposals.developerId))
    .where(where)
    .orderBy(...projectProposalsOrder(sort))
    .limit(PROJECT_PROPOSALS_PAGE_SIZE)
    .offset((page - 1) * PROJECT_PROPOSALS_PAGE_SIZE);

  return {
    items,
    total,
    page,
    pageSize: PROJECT_PROPOSALS_PAGE_SIZE,
    totalPages: Math.ceil(total / PROJECT_PROPOSALS_PAGE_SIZE),
  };
}

export async function getProjectProposal(
  actor: AuthUser,
  projectId: string,
  proposalId: string,
): Promise<ClientProposalDetail> {
  assertProjectReader(actor);
  await assertProjectOwner(actor, projectId);

  const [row] = await db
    .select({ ...clientSummaryColumns, description: proposals.description })
    .from(proposals)
    .innerJoin(users, eq(users.id, proposals.developerId))
    .where(
      and(
        eq(proposals.id, proposalId),
        eq(proposals.projectId, projectId),
        ne(proposals.status, "withdrawn"),
      ),
    )
    .limit(1);
  if (!row) throw new AuthError("NOT_FOUND");
  return row;
}
