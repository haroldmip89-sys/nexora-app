import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { requireOwnership } from "@/modules/auth/services/current-user.service";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import type { ProjectPaymentOverview } from "@/modules/payments/types/payment.types";
import { projects } from "@/modules/projects/schema/projects.table";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";

/**
 * Read-only payment state for the owning client (spec 009 RF6). No locks, no writes, no Stripe.
 * Explicit projection: no Stripe ids, checkout URL, clientId, developerId, email or contact.
 */
export async function getProjectPaymentOverview(
  actor: AuthUser,
  projectId: string,
): Promise<ProjectPaymentOverview> {
  if (!can(actor.role, "payment.start")) throw new AuthError("FORBIDDEN");

  const [project] = await db
    .select({
      id: projects.id,
      clientId: projects.clientId,
      title: projects.title,
      status: projects.status,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new AuthError("NOT_FOUND");
  requireOwnership(actor, project.clientId);

  const [winner] = await db
    .select({
      developerName: users.displayName,
      priceCents: proposals.priceCents,
      timelineWeeks: proposals.timelineWeeks,
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
    .where(and(eq(proposalSelections.projectId, projectId), eq(proposals.status, "accepted")))
    .limit(1);
  if (!winner) throw new AuthError("NOT_FOUND");

  const [latest] = await db
    .select({
      status: paymentAttempts.status,
      amountCents: paymentAttempts.amountCents,
      createdAt: paymentAttempts.createdAt,
      updatedAt: paymentAttempts.updatedAt,
    })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.projectId, projectId))
    .orderBy(desc(paymentAttempts.createdAt), desc(paymentAttempts.id))
    .limit(1);

  const selected = project.status === "proposal_selected";
  const attempt = latest ?? null;
  return {
    project: { id: project.id, title: project.title, status: project.status },
    proposal: {
      developerName: winner.developerName,
      priceCents: winner.priceCents,
      currency: "USD",
      timelineWeeks: winner.timelineWeeks,
    },
    attempt,
    canStart: selected && (!attempt || attempt.status === "failed" || attempt.status === "canceled"),
    canResume: selected && attempt?.status === "pending",
  };
}
