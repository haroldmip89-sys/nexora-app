import "server-only";
import { and, asc, count, desc, eq, inArray, min } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { connectedAccounts } from "@/modules/payments/schema/connected-accounts.table";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { projects } from "@/modules/projects/schema/projects.table";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { developerRatings } from "@/modules/ratings/schema/developer-ratings.table";
import { users } from "@/modules/users/schema/users.table";
import {
  DASHBOARD_LIST_LIMIT,
  type ClientDashboard,
  type DashboardAction,
  type DashboardActionKind,
  type DashboardProjectPayment,
} from "../types/dashboard.types";
import { deriveProjectActions } from "./dashboard-actions";

const CONTRACTING_STATUSES = ["proposal_selected", "contracted"] as const;

const ACTION_ORDER: DashboardActionKind[] = ["resume_payment", "start_payment", "choose_proposal", "rate"];

function emptyCounts(): Record<ProjectStatus, number> {
  return { draft: 0, published: 0, proposal_selected: 0, contracted: 0, closed: 0 };
}

/**
 * Read-only summary for the owning client (spec 012). Only the database: no Stripe, no writes.
 * Query count is constant with respect to the number of projects. Explicit projection: no Stripe
 * ids, clientId, developerId, email or contact.
 */
export async function getClientDashboard(actor: AuthUser): Promise<ClientDashboard> {
  if (actor.role !== "client" || !can(actor.role, "project.readPrivate")) {
    throw new AuthError("FORBIDDEN");
  }

  const contractingScope = and(
    eq(projects.clientId, actor.id),
    inArray(projects.status, [...CONTRACTING_STATUSES]),
    eq(proposals.status, "accepted"),
  );

  const [statusRows, choosable, contractingRows, [totalRow]] = await Promise.all([
    db
      .select({ status: projects.status, total: count() })
      .from(projects)
      .where(eq(projects.clientId, actor.id))
      .groupBy(projects.status),
    db
      .select({
        projectId: projects.id,
        title: projects.title,
        pending: count(proposals.id),
        oldest: min(proposals.createdAt),
      })
      .from(projects)
      .innerJoin(proposals, and(eq(proposals.projectId, projects.id), eq(proposals.status, "pending")))
      .where(and(eq(projects.clientId, actor.id), eq(projects.status, "published")))
      .groupBy(projects.id, projects.title)
      .orderBy(asc(min(proposals.createdAt)), asc(projects.id))
      .limit(DASHBOARD_LIST_LIMIT),
    db
      .select({
        projectId: projects.id,
        title: projects.title,
        status: projects.status,
        developerId: proposals.developerId,
        developerName: users.displayName,
        imageUrl: users.imageUrl,
        amountCents: proposals.priceCents,
      })
      .from(projects)
      .innerJoin(proposalSelections, eq(proposalSelections.projectId, projects.id))
      .innerJoin(
        proposals,
        and(eq(proposals.id, proposalSelections.proposalId), eq(proposals.projectId, proposalSelections.projectId)),
      )
      .innerJoin(users, eq(users.id, proposals.developerId))
      .where(contractingScope)
      .orderBy(desc(projects.updatedAt), desc(projects.id))
      .limit(DASHBOARD_LIST_LIMIT),
    db
      .select({ total: count() })
      .from(projects)
      .innerJoin(proposalSelections, eq(proposalSelections.projectId, projects.id))
      .innerJoin(
        proposals,
        and(eq(proposals.id, proposalSelections.proposalId), eq(proposals.projectId, proposalSelections.projectId)),
      )
      .where(contractingScope),
  ]);

  const byStatus = emptyCounts();
  let total = 0;
  for (const row of statusRows) {
    byStatus[row.status] = row.total;
    total += row.total;
  }

  const projectIds = contractingRows.map((r) => r.projectId);
  const developerIds = [...new Set(contractingRows.map((r) => r.developerId))];

  const [attemptRows, transferRows, accountRows, ratingRows] = projectIds.length
    ? await Promise.all([
        db
          .selectDistinctOn([paymentAttempts.projectId], {
            projectId: paymentAttempts.projectId,
            status: paymentAttempts.status,
            updatedAt: paymentAttempts.updatedAt,
          })
          .from(paymentAttempts)
          .where(inArray(paymentAttempts.projectId, projectIds))
          .orderBy(paymentAttempts.projectId, desc(paymentAttempts.createdAt), desc(paymentAttempts.id)),
        db
          .selectDistinctOn([paymentAttempts.projectId], {
            projectId: paymentAttempts.projectId,
            status: developerTransfers.status,
            completedAt: developerTransfers.completedAt,
          })
          .from(developerTransfers)
          .innerJoin(paymentAttempts, eq(paymentAttempts.id, developerTransfers.paymentAttemptId))
          .where(and(inArray(paymentAttempts.projectId, projectIds), eq(paymentAttempts.status, "completed_test")))
          .orderBy(paymentAttempts.projectId, desc(paymentAttempts.createdAt), desc(paymentAttempts.id)),
        db
          .select({ userId: connectedAccounts.userId, status: connectedAccounts.status })
          .from(connectedAccounts)
          .where(inArray(connectedAccounts.userId, developerIds)),
        db
          .select({ projectId: developerRatings.projectId })
          .from(developerRatings)
          .where(inArray(developerRatings.projectId, projectIds)),
      ])
    : [[], [], [], []];

  const attemptByProject = new Map(attemptRows.map((r) => [r.projectId, r]));
  const transferByProject = new Map(transferRows.map((r) => [r.projectId, r]));
  const activeDevelopers = new Set(accountRows.filter((r) => r.status === "active").map((r) => r.userId));
  const ratedProjects = new Set(ratingRows.map((r) => r.projectId));

  const contracting: DashboardProjectPayment[] = contractingRows.map((row) => {
    const attempt = attemptByProject.get(row.projectId);
    const transfer = transferByProject.get(row.projectId);
    return {
      projectId: row.projectId,
      title: row.title,
      status: row.status as DashboardProjectPayment["status"],
      developerId: row.developerId,
      developerName: row.developerName,
      imageUrl: row.imageUrl,
      amountCents: row.amountCents,
      payment: attempt ? { status: attempt.status, updatedAt: attempt.updatedAt } : null,
      transfer: transfer ? { status: transfer.status, completedAt: transfer.completedAt } : null,
      developerPayoutsReady: activeDevelopers.has(row.developerId),
      rated: ratedProjects.has(row.projectId),
    };
  });

  const chooseActions: DashboardAction[] = choosable.map((r) => ({
    kind: "choose_proposal",
    projectId: r.projectId,
    projectTitle: r.title,
    pendingProposals: r.pending,
  }));
  const derived = [...chooseActions, ...contracting.flatMap(deriveProjectActions)];
  const pendingActions = ACTION_ORDER.flatMap((kind) => derived.filter((a) => a.kind === kind)).slice(
    0,
    DASHBOARD_LIST_LIMIT,
  );

  return {
    counts: { total, byStatus },
    pendingActions,
    contracting,
    contractingTotal: totalRow?.total ?? 0,
  };
}
