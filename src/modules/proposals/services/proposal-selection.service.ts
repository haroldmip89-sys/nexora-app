import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { requireOwnership } from "@/modules/auth/services/current-user.service";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { projects } from "@/modules/projects/schema/projects.table";
import { markProposalSelected } from "@/modules/projects/services/project-transitions";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { ProposalError } from "@/modules/proposals/services/proposal-errors";
import {
  acceptPendingProposal,
  rejectPendingProposals,
} from "@/modules/proposals/services/proposal-transitions";
import type {
  ProposalSelectionResult,
  SelectProposalInput,
} from "@/modules/proposals/types/proposal.types";

/**
 * Atomic selection of the winning proposal (spec 008 RF2). Lock order is always
 * project -> proposal; every transition UPDATE carries its state guard in the WHERE.
 * Any error thrown inside the transaction rolls everything back.
 */
export async function selectProposal(
  actor: AuthUser,
  input: SelectProposalInput,
): Promise<ProposalSelectionResult> {
  if (!can(actor.role, "proposal.select")) throw new AuthError("FORBIDDEN");
  const { projectId, proposalId, seenUpdatedAt } = input;

  return db.transaction(async (tx) => {
    // 1.1 Project lock (first). Foreign owner (admin included) is indistinguishable from unknown.
    const [project] = await tx
      .select({ id: projects.id, clientId: projects.clientId, status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
      .for("update");
    if (!project) throw new AuthError("NOT_FOUND");
    requireOwnership(actor, project.clientId);

    // 1.2 Decision by project status, already under the lock.
    if (project.status === "proposal_selected" || project.status === "contracted") {
      const [existing] = await tx
        .select({ proposalId: proposalSelections.proposalId, selectedAt: proposalSelections.selectedAt })
        .from(proposalSelections)
        .where(eq(proposalSelections.projectId, projectId))
        .limit(1);
      if (existing && existing.proposalId === proposalId) {
        return { projectId, proposalId, selectedAt: existing.selectedAt, alreadySelected: true };
      }
      throw new ProposalError("ALREADY_SELECTED");
    }
    if (project.status !== "published") throw new ProposalError("PROJECT_NOT_OPEN");

    // 1.3 Proposal lock (second). Version compared in JS: the DB stores microseconds, drizzle reads milliseconds.
    const [proposal] = await tx
      .select({ id: proposals.id, status: proposals.status, updatedAt: proposals.updatedAt })
      .from(proposals)
      .where(and(eq(proposals.id, proposalId), eq(proposals.projectId, projectId)))
      .limit(1)
      .for("update");
    if (!proposal) throw new AuthError("NOT_FOUND");
    if (proposal.status !== "pending") throw new ProposalError("INVALID_STATE");
    if (proposal.updatedAt.getTime() !== seenUpdatedAt.getTime()) {
      throw new ProposalError("PROPOSAL_CHANGED");
    }

    // 1.4 Record the selection. A DB UNIQUE firing here means the lock was bypassed (safety net).
    const [selection] = await tx
      .insert(proposalSelections)
      .values({ projectId, proposalId, selectedBy: actor.id })
      .onConflictDoNothing()
      .returning({ selectedAt: proposalSelections.selectedAt });
    if (!selection) throw new ProposalError("ALREADY_SELECTED");

    // 1.5 - 1.7 Transitions (leaves). The winner is no longer pending, so the reject only hits the others.
    if (!(await acceptPendingProposal(tx, { proposalId, projectId }))) {
      throw new ProposalError("INVALID_STATE");
    }
    await rejectPendingProposals(tx, projectId);
    if (!(await markProposalSelected(tx, projectId))) throw new ProposalError("INVALID_STATE");

    // 1.8
    return { projectId, proposalId, selectedAt: selection.selectedAt, alreadySelected: false };
  });
}
