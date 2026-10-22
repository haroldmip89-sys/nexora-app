import "server-only";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { getConnectedAccountOverview } from "@/modules/payments/services/connected-account.service";
import type { TransferReason } from "@/modules/payments/types/developer-transfer.types";
import { projects } from "@/modules/projects/schema/projects.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import type { ProposalStatus } from "@/modules/proposals/types/proposal.types";
import { getDeveloperRatingSummary } from "@/modules/ratings/services/rating.service";
import { abbreviateClientName } from "@/modules/ratings/services/client-name";
import { users } from "@/modules/users/schema/users.table";
import { DASHBOARD_LIST_LIMIT } from "../types/dashboard.types";
import type { DeveloperDashboard, DeveloperWonProject } from "../types/developer-dashboard.types";
import { deriveDeveloperActions } from "./developer-dashboard-actions";

const WON_PROJECT_STATUSES = ["proposal_selected", "contracted"] as const;

function emptyCounts(): Record<ProposalStatus, number> {
  return { pending: 0, accepted: 0, rejected: 0, withdrawn: 0 };
}

/**
 * Read-only summary for the developer (spec 013). Only the database: no Stripe, no writes.
 * Query count is constant with respect to the number of won projects. Explicit projection: no
 * Stripe ids, developerId, clientId, attempt ids, email or client contact.
 */
export async function getDeveloperDashboard(actor: AuthUser): Promise<DeveloperDashboard> {
  if (actor.role !== "developer" || !can(actor.role, "payout.manage")) {
    throw new AuthError("FORBIDDEN");
  }

  const wonScope = and(
    eq(proposals.developerId, actor.id),
    eq(proposals.status, "accepted"),
    inArray(projects.status, [...WON_PROJECT_STATUSES]),
  );

  const [statusRows, wonRows, [wonTotalRow], payouts, ratings] = await Promise.all([
    db
      .select({ status: proposals.status, total: count() })
      .from(proposals)
      .where(eq(proposals.developerId, actor.id))
      .groupBy(proposals.status),
    db
      .select({
        projectId: projects.id,
        title: projects.title,
        status: projects.status,
        clientName: users.displayName,
        amountCents: proposals.priceCents,
      })
      .from(proposals)
      .innerJoin(projects, eq(projects.id, proposals.projectId))
      .innerJoin(users, eq(users.id, projects.clientId))
      .where(wonScope)
      .orderBy(desc(projects.updatedAt), desc(projects.id))
      .limit(DASHBOARD_LIST_LIMIT),
    db
      .select({ total: count() })
      .from(proposals)
      .innerJoin(projects, eq(projects.id, proposals.projectId))
      .where(wonScope),
    getConnectedAccountOverview(actor),
    getDeveloperRatingSummary(actor.id),
  ]);

  const byStatus = emptyCounts();
  let total = 0;
  for (const row of statusRows) {
    byStatus[row.status] = row.total;
    total += row.total;
  }

  const projectIds = wonRows.map((r) => r.projectId);
  const [attemptRows, transferRows] = projectIds.length
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
            reason: developerTransfers.lastErrorCode,
          })
          .from(developerTransfers)
          .innerJoin(paymentAttempts, eq(paymentAttempts.id, developerTransfers.paymentAttemptId))
          .where(
            and(
              inArray(paymentAttempts.projectId, projectIds),
              eq(paymentAttempts.status, "completed_test"),
              eq(developerTransfers.developerId, actor.id),
            ),
          )
          .orderBy(paymentAttempts.projectId, desc(paymentAttempts.createdAt), desc(paymentAttempts.id)),
      ])
    : [[], []];

  const attemptByProject = new Map(attemptRows.map((r) => [r.projectId, r]));
  const transferByProject = new Map(transferRows.map((r) => [r.projectId, r]));

  const won: DeveloperWonProject[] = wonRows.map((row) => {
    const attempt = attemptByProject.get(row.projectId);
    const transfer = transferByProject.get(row.projectId);
    return {
      projectId: row.projectId,
      title: row.title,
      status: row.status as DeveloperWonProject["status"],
      clientName: abbreviateClientName(row.clientName),
      amountCents: row.amountCents,
      payment: attempt ? { status: attempt.status, updatedAt: attempt.updatedAt } : null,
      transfer: transfer
        ? {
            status: transfer.status,
            completedAt: transfer.completedAt,
            reason: transfer.reason as TransferReason | null,
          }
        : null,
    };
  });

  return {
    proposals: { total, byStatus },
    payouts,
    ratings,
    pendingActions: deriveDeveloperActions({ payouts, won }),
    won,
    wonTotal: wonTotalRow?.total ?? 0,
  };
}
