"use server";

import { revalidatePath } from "next/cache";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { selectProposalInputSchema } from "@/modules/proposals/schemas/proposal-selection.schema";
import {
  PROPOSAL_SELECTION_ERROR_MESSAGES,
  ProposalError,
} from "@/modules/proposals/services/proposal-errors";
import { selectProposal } from "@/modules/proposals/services/proposal-selection.service";
import { RATE_LIMITED_MESSAGE, enforceRateLimit } from "@/modules/security/services/rate-limit.service";
import type { ProposalActionResult } from "@/modules/proposals/types/proposal.types";

const NOT_FOUND_MESSAGE = "No encontramos el proyecto o la propuesta.";
const GENERIC_MESSAGE = "No pudimos completar la acción. Inténtalo de nuevo.";

function toResult(error: unknown): ProposalActionResult {
  if (error instanceof ProposalError) {
    return {
      ok: false,
      code: error.code,
      message: PROPOSAL_SELECTION_ERROR_MESSAGES[error.code],
    };
  }
  if (error instanceof AuthError) {
    if (error.code === "NOT_FOUND") return { ok: false, code: "NOT_FOUND", message: NOT_FOUND_MESSAGE };
    handleAuthErrorForPage(error);
  }
  return { ok: false, code: "UNKNOWN", message: GENERIC_MESSAGE };
}

function revalidateSelectionPaths(projectId: string) {
  revalidatePath(`/projects/${projectId}/proposals`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/edit`);
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/proposals");
  // The project leaves the public catalog once a proposal is selected.
  revalidatePath("/projects");
}

export async function selectProposalAction(
  projectId: string,
  proposalId: string,
  seenUpdatedAt: string,
): Promise<ProposalActionResult> {
  let actor;
  try {
    actor = await requireRole("client");
  } catch (e) {
    handleAuthErrorForPage(e);
  }

  const limit = await enforceRateLimit(actor, "proposal.select");
  if (!limit.ok) return { ok: false, code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE };

  const parsed = selectProposalInputSchema.safeParse({ projectId, proposalId, seenUpdatedAt });
  if (!parsed.success) {
    const badIds = parsed.error.issues.some((issue) => issue.path[0] !== "seenUpdatedAt");
    return badIds
      ? { ok: false, code: "NOT_FOUND", message: NOT_FOUND_MESSAGE }
      : {
          ok: false,
          code: "PROPOSAL_CHANGED",
          message: PROPOSAL_SELECTION_ERROR_MESSAGES.PROPOSAL_CHANGED,
        };
  }

  try {
    await selectProposal(actor, parsed.data);
  } catch (e) {
    return toResult(e);
  }

  revalidateSelectionPaths(parsed.data.projectId);
  return { ok: true };
}
