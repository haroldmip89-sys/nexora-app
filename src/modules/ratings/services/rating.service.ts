import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { requireOwnership } from "@/modules/auth/services/current-user.service";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { projects } from "@/modules/projects/schema/projects.table";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { developerRatings } from "@/modules/ratings/schema/developer-ratings.table";
import type { RatingInput } from "@/modules/ratings/schemas/rating.schema";
import type {
  DeveloperRatingSummary,
  ProjectRatingView,
  PublicDeveloperRating,
} from "@/modules/ratings/types/rating.types";
import { users } from "@/modules/users/schema/users.table";
import { abbreviateClientName } from "./client-name";
import { RatingError } from "./rating-errors";
import { getEditCutoff, getEditWindow } from "./rating-window";

type Deps = { now?: () => Date };

const MAX_LIST = 20;

/** Project of the acting client (FORBIDDEN for non-clients, NOT_FOUND for missing or foreign). */
async function loadOwnedProject(actor: AuthUser, projectId: string) {
  if (!can(actor.role, "rating.create")) throw new AuthError("FORBIDDEN");
  const [project] = await db
    .select({ id: projects.id, clientId: projects.clientId, title: projects.title, contractedAt: projects.contractedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new AuthError("NOT_FOUND");
  requireOwnership(actor, project.clientId);
  return project;
}

/** Accepted proposal of a contracted project (null if not contracted or no winner). */
async function findContractedWinner(project: { id: string; contractedAt: Date | null }) {
  if (!project.contractedAt) return null;
  const [winner] = await db
    .select({
      proposalId: proposals.id,
      developerId: proposals.developerId,
      developerName: users.displayName,
    })
    .from(proposalSelections)
    .innerJoin(
      proposals,
      and(
        eq(proposals.id, proposalSelections.proposalId),
        eq(proposals.projectId, proposalSelections.projectId),
      ),
    )
    .innerJoin(users, eq(users.id, proposals.developerId))
    .where(and(eq(proposalSelections.projectId, project.id), eq(proposals.status, "accepted")))
    .limit(1);
  return winner ?? null;
}

export async function createDeveloperRating(
  actor: AuthUser,
  projectId: string,
  input: RatingInput,
): Promise<{ developerId: string }> {
  const project = await loadOwnedProject(actor, projectId);
  const winner = await findContractedWinner(project);
  if (!winner) throw new RatingError("NOT_CONTRACTED");

  const inserted = await db
    .insert(developerRatings)
    .values({ projectId, proposalId: winner.proposalId, rating: input.rating, comment: input.comment })
    .onConflictDoNothing({ target: developerRatings.projectId })
    .returning({ id: developerRatings.id });
  if (inserted.length === 0) throw new RatingError("ALREADY_RATED");
  return { developerId: winner.developerId };
}

export async function updateDeveloperRating(
  actor: AuthUser,
  projectId: string,
  input: RatingInput,
  deps: Deps = {},
): Promise<{ developerId: string }> {
  await loadOwnedProject(actor, projectId);
  const now = (deps.now ?? (() => new Date()))();

  const [updated] = await db
    .update(developerRatings)
    .set({ rating: input.rating, comment: input.comment })
    .where(and(eq(developerRatings.projectId, projectId), gt(developerRatings.createdAt, getEditCutoff(now))))
    .returning({ proposalId: developerRatings.proposalId });

  if (!updated) {
    const [existing] = await db
      .select({ id: developerRatings.id })
      .from(developerRatings)
      .where(eq(developerRatings.projectId, projectId))
      .limit(1);
    throw new RatingError(existing ? "EDIT_WINDOW_CLOSED" : "RATING_NOT_FOUND");
  }

  const [proposal] = await db
    .select({ developerId: proposals.developerId })
    .from(proposals)
    .where(eq(proposals.id, updated.proposalId))
    .limit(1);
  return { developerId: proposal.developerId };
}

export async function getProjectRatingView(
  actor: AuthUser,
  projectId: string,
  deps: Deps = {},
): Promise<ProjectRatingView> {
  const project = await loadOwnedProject(actor, projectId);
  const winner = await findContractedWinner(project);
  if (!winner) throw new AuthError("NOT_FOUND");
  const now = (deps.now ?? (() => new Date()))();

  const [row] = await db
    .select({
      rating: developerRatings.rating,
      comment: developerRatings.comment,
      createdAt: developerRatings.createdAt,
    })
    .from(developerRatings)
    .where(eq(developerRatings.projectId, projectId))
    .limit(1);

  return {
    project: { id: project.id, title: project.title },
    developerName: winner.developerName,
    previewName: abbreviateClientName(actor.displayName),
    rating: row
      ? {
          rating: row.rating,
          comment: row.comment,
          createdAt: row.createdAt,
          ...getEditWindow(row.createdAt, now),
        }
      : null,
    canCreate: !row,
  };
}

/** Public read (no session). average is rounded to 1 decimal in SQL; null when count is 0. */
export async function getDeveloperRatingSummary(developerId: string): Promise<DeveloperRatingSummary> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      average: sql<string | null>`round(avg(${developerRatings.rating})::numeric, 1)`,
    })
    .from(developerRatings)
    .innerJoin(proposals, eq(proposals.id, developerRatings.proposalId))
    .where(eq(proposals.developerId, developerId));
  const count = row?.count ?? 0;
  return { average: count === 0 || row.average === null ? null : Number(row.average), count };
}

/** Public read (no session). Explicit projection: no ids, no email, abbreviated client name. */
export async function listDeveloperRatings(
  developerId: string,
  opts: { limit?: number } = {},
): Promise<PublicDeveloperRating[]> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? MAX_LIST), 1), MAX_LIST);
  const rows = await db
    .select({
      rating: developerRatings.rating,
      comment: developerRatings.comment,
      createdAt: developerRatings.createdAt,
      clientDisplayName: users.displayName,
    })
    .from(developerRatings)
    .innerJoin(proposals, eq(proposals.id, developerRatings.proposalId))
    .innerJoin(projects, eq(projects.id, developerRatings.projectId))
    .innerJoin(users, eq(users.id, projects.clientId))
    .where(eq(proposals.developerId, developerId))
    .orderBy(desc(developerRatings.createdAt), desc(developerRatings.id))
    .limit(limit);
  return rows.map((r) => ({
    rating: r.rating,
    comment: r.comment,
    clientName: abbreviateClientName(r.clientDisplayName),
    createdAt: r.createdAt,
  }));
}
