import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { requireOwnership } from "@/modules/auth/services/current-user.service";
import { can } from "@/modules/auth/services/permissions";
import type { Action, AuthUser } from "@/modules/auth/types/auth.types";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { projects } from "@/modules/projects/schema/projects.table";
import { projectInputSchema, projectListQuerySchema } from "@/modules/projects/schemas/project.schema";
import { ProjectError } from "@/modules/projects/services/project-errors";
import type {
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectListItem,
  ProjectListQuery,
  ProjectPage,
} from "@/modules/projects/types/project.types";
import {
  getProjectTechnologySlugs,
  replaceProjectTechnologies,
} from "@/modules/projects/services/technology.service";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { rejectPendingProposals } from "@/modules/proposals/services/proposal-transitions";

export const PROJECT_PAGE_SIZE = 10;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function assertCan(actor: AuthUser, action: Action): void {
  if (!can(actor.role, action)) throw new AuthError("FORBIDDEN");
}

/** Unknown id and foreign id are indistinguishable: both NOT_FOUND. */
async function loadOwned(
  executor: Pick<typeof db, "select">,
  actor: AuthUser,
  projectId: string,
  opts: { allowAdmin?: boolean; lock?: boolean } = {},
): Promise<Project> {
  const query = executor.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const [row] = opts.lock ? await query.for("update") : await query;
  if (!row) throw new AuthError("NOT_FOUND");
  requireOwnership(actor, row.clientId, { allowAdmin: opts.allowAdmin });
  return row;
}

// Columns are written qualified on purpose: drizzle renders them unqualified in a single-table select,
// which would resolve `id` to the inner table.
const proposalCountSql = sql<number>`(select count(*)::int from "proposals" where "proposals"."project_id" = "projects"."id")`;

export async function createProject(
  actor: AuthUser,
  input: ProjectInput,
  opts: { publish?: boolean } = {},
): Promise<Project> {
  assertCan(actor, "project.create");
  const publish = opts.publish === true;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({
        clientId: actor.id,
        title: input.title,
        category: input.category,
        description: input.description,
        budgetMinCents: input.budgetMinCents,
        budgetMaxCents: input.budgetMaxCents,
        timelineWeeks: input.timelineWeeks,
        status: publish ? "published" : "draft",
        publishedAt: publish ? new Date() : null,
      })
      .returning();
    await replaceProjectTechnologies(tx, row.id, input.technologies);
    return row;
  });
}

export async function updateProject(
  actor: AuthUser,
  projectId: string,
  input: ProjectInput,
): Promise<Project> {
  assertCan(actor, "project.update");
  return db.transaction(async (tx) => {
    const current = await loadOwned(tx, actor, projectId, { lock: true });

    if (current.status === "draft") {
      const [row] = await tx
        .update(projects)
        .set({
          title: input.title,
          category: input.category,
          description: input.description,
          budgetMinCents: input.budgetMinCents,
          budgetMaxCents: input.budgetMaxCents,
          timelineWeeks: input.timelineWeeks,
        })
        .where(and(eq(projects.id, projectId), eq(projects.status, "draft")))
        .returning();
      if (!row) throw new ProjectError("INVALID_STATE");
      await replaceProjectTechnologies(tx, projectId, input.technologies);
      return row;
    }

    if (current.status === "published") {
      const lockedChanged =
        input.category !== current.category ||
        input.budgetMinCents !== current.budgetMinCents ||
        input.budgetMaxCents !== current.budgetMaxCents ||
        input.timelineWeeks !== current.timelineWeeks;
      if (lockedChanged) throw new ProjectError("LOCKED_FIELDS");

      const [row] = await tx
        .update(projects)
        .set({ title: input.title, description: input.description })
        .where(and(eq(projects.id, projectId), eq(projects.status, "published")))
        .returning();
      if (!row) throw new ProjectError("INVALID_STATE");
      await replaceProjectTechnologies(tx, projectId, input.technologies);
      return row;
    }

    throw new ProjectError("INVALID_STATE");
  });
}

export async function publishProject(actor: AuthUser, projectId: string): Promise<Project> {
  assertCan(actor, "project.publish");
  const current = await loadOwned(db, actor, projectId);
  if (current.status !== "draft") throw new ProjectError("INVALID_STATE");

  const technologySlugs = await getProjectTechnologySlugs(db, projectId);
  const valid = projectInputSchema.safeParse({ ...current, technologies: technologySlugs });
  if (!valid.success) throw new ProjectError("INVALID_PROJECT");

  const [row] = await db
    .update(projects)
    .set({ status: "published", publishedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.status, "draft")))
    .returning();
  if (!row) throw new ProjectError("INVALID_STATE");
  return row;
}

export async function unpublishProject(actor: AuthUser, projectId: string): Promise<Project> {
  assertCan(actor, "project.publish");
  return db.transaction(async (tx) => {
    const current = await loadOwned(tx, actor, projectId, { lock: true });
    if (current.status !== "published") throw new ProjectError("INVALID_STATE");

    const [existing] = await tx
      .select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.projectId, projectId))
      .limit(1);
    if (existing) throw new ProjectError("HAS_PROPOSALS");

    const [row] = await tx
      .update(projects)
      .set({ status: "draft", publishedAt: null })
      .where(and(eq(projects.id, projectId), eq(projects.status, "published")))
      .returning();
    if (!row) throw new ProjectError("INVALID_STATE");
    return row;
  });
}

async function hasActivePayment(tx: Tx, projectId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: paymentAttempts.id })
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.projectId, projectId),
        inArray(paymentAttempts.status, ["pending", "completed_test"]),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function closeProject(actor: AuthUser, projectId: string): Promise<Project> {
  assertCan(actor, "project.close");
  return db.transaction(async (tx) => {
    const current = await loadOwned(tx, actor, projectId, { allowAdmin: true, lock: true });
    const observed = current.status;
    if (observed === "draft" || observed === "closed") throw new ProjectError("INVALID_STATE");

    if (observed === "proposal_selected" && (await hasActivePayment(tx, projectId))) {
      throw new ProjectError("PAYMENT_IN_PROGRESS");
    }

    const [row] = await tx
      .update(projects)
      .set({ status: "closed", closedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.status, observed)))
      .returning();
    if (!row) throw new ProjectError("INVALID_STATE");

    if (observed === "published") {
      await rejectPendingProposals(tx, projectId);
    }
    return row;
  });
}

export async function listMyProjects(
  actor: AuthUser,
  query: Partial<ProjectListQuery> = {},
): Promise<ProjectPage> {
  assertCan(actor, "project.readPrivate");
  const { status, sort, page } = projectListQuerySchema.parse(query);

  const where = and(
    eq(projects.clientId, actor.id),
    status === "all" ? undefined : eq(projects.status, status),
  );

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(projects)
    .where(where);

  const order = sort === "oldest" ? [asc(projects.createdAt), asc(projects.id)] : [desc(projects.createdAt), desc(projects.id)];

  const items: ProjectListItem[] = await db
    .select({
      id: projects.id,
      title: projects.title,
      category: projects.category,
      status: projects.status,
      budgetMinCents: projects.budgetMinCents,
      budgetMaxCents: projects.budgetMaxCents,
      timelineWeeks: projects.timelineWeeks,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      publishedAt: projects.publishedAt,
      proposalCount: proposalCountSql,
    })
    .from(projects)
    .where(where)
    .orderBy(...order)
    .limit(PROJECT_PAGE_SIZE)
    .offset((page - 1) * PROJECT_PAGE_SIZE);

  return {
    items,
    total,
    page,
    pageSize: PROJECT_PAGE_SIZE,
    totalPages: Math.ceil(total / PROJECT_PAGE_SIZE),
  };
}

export async function getMyProject(actor: AuthUser, projectId: string): Promise<ProjectDetail> {
  assertCan(actor, "project.readPrivate");
  const project = await loadOwned(db, actor, projectId, { allowAdmin: true });
  const [{ proposalCount }] = await db
    .select({ proposalCount: sql<number>`count(*)::int` })
    .from(proposals)
    .where(eq(proposals.projectId, projectId));
  const technologySlugs = await getProjectTechnologySlugs(db, projectId);
  return { ...project, proposalCount, technologies: technologySlugs };
}
