"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { PROPOSAL_FORM_FIELDS, parseProposalForm } from "@/modules/proposals/schemas/proposal.schema";
import {
  PROPOSAL_ERROR_MESSAGES,
  ProposalError,
} from "@/modules/proposals/services/proposal-errors";
import {
  createProposal,
  updateProposal,
  withdrawProposal,
} from "@/modules/proposals/services/proposal.service";
import type {
  ProposalActionResult,
  ProposalFormState,
  ProposalFormValues,
} from "@/modules/proposals/types/proposal.types";

const NOT_FOUND_MESSAGE = "No encontramos el proyecto o la propuesta.";
const GENERIC_MESSAGE = "No pudimos completar la acción. Inténtalo de nuevo.";

const uuidSchema = z.uuid();

function isValidId(id: unknown): id is string {
  return uuidSchema.safeParse(id).success;
}

function readValues(formData: FormData): ProposalFormValues {
  return Object.fromEntries(
    PROPOSAL_FORM_FIELDS.map((name) => {
      const value = formData.get(name);
      return [name, typeof value === "string" ? value : ""];
    }),
  ) as ProposalFormValues;
}

function formError(
  formData: FormData,
  message: string,
  fieldErrors: Extract<ProposalFormState, { status: "error" }>["fieldErrors"] = {},
  values: ProposalFormValues = readValues(formData),
): ProposalFormState {
  return { status: "error", message, fieldErrors, values };
}

/** Translates a service/unknown error into a form state. Auth errors other than NOT_FOUND redirect/404. */
function toFormState(error: unknown, formData: FormData): ProposalFormState {
  if (error instanceof ProposalError) return formError(formData, PROPOSAL_ERROR_MESSAGES[error.code]);
  if (error instanceof AuthError) {
    if (error.code === "NOT_FOUND") return formError(formData, NOT_FOUND_MESSAGE);
    handleAuthErrorForPage(error);
  }
  return formError(formData, GENERIC_MESSAGE);
}

function toResult(error: unknown): ProposalActionResult {
  if (error instanceof ProposalError) {
    return { ok: false, code: error.code, message: PROPOSAL_ERROR_MESSAGES[error.code] };
  }
  if (error instanceof AuthError) {
    if (error.code === "NOT_FOUND") return { ok: false, code: "NOT_FOUND", message: NOT_FOUND_MESSAGE };
    handleAuthErrorForPage(error);
  }
  return { ok: false, code: "UNKNOWN", message: GENERIC_MESSAGE };
}

function revalidateProposalPaths(projectId: string, { projectViews }: { projectViews: boolean }) {
  revalidatePath("/dashboard/proposals");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/proposals`);
  if (projectViews) {
    // The proposal count governs "Despublicar" in the project screens.
    revalidatePath("/dashboard/projects");
    revalidatePath(`/projects/${projectId}/edit`);
  }
}

export async function createProposalAction(
  projectId: string,
  _prev: ProposalFormState,
  formData: FormData,
): Promise<ProposalFormState> {
  let actor;
  try {
    actor = await requireRole("developer");
  } catch (e) {
    handleAuthErrorForPage(e);
  }

  if (!isValidId(projectId)) return formError(formData, NOT_FOUND_MESSAGE);

  const parsed = parseProposalForm(formData);
  if (!parsed.success) {
    return formError(formData, "Revisa los campos marcados.", parsed.fieldErrors, parsed.values);
  }

  try {
    await createProposal(actor, projectId, parsed.data);
  } catch (e) {
    return toFormState(e, formData);
  }

  revalidateProposalPaths(projectId, { projectViews: true });
  return { status: "success" };
}

export async function updateProposalAction(
  proposalId: string,
  _prev: ProposalFormState,
  formData: FormData,
): Promise<ProposalFormState> {
  let actor;
  try {
    actor = await requireRole("developer");
  } catch (e) {
    handleAuthErrorForPage(e);
  }

  if (!isValidId(proposalId)) return formError(formData, NOT_FOUND_MESSAGE);

  const parsed = parseProposalForm(formData);
  if (!parsed.success) {
    return formError(formData, "Revisa los campos marcados.", parsed.fieldErrors, parsed.values);
  }

  let projectId: string;
  try {
    ({ projectId } = await updateProposal(actor, proposalId, parsed.data));
  } catch (e) {
    return toFormState(e, formData);
  }

  revalidateProposalPaths(projectId, { projectViews: false });
  return { status: "success" };
}

export async function withdrawProposalAction(proposalId: string): Promise<ProposalActionResult> {
  let actor;
  try {
    actor = await requireRole("developer");
  } catch (e) {
    handleAuthErrorForPage(e);
  }

  if (!isValidId(proposalId)) {
    return { ok: false, code: "NOT_FOUND", message: NOT_FOUND_MESSAGE };
  }

  let projectId: string;
  try {
    ({ projectId } = await withdrawProposal(actor, proposalId));
  } catch (e) {
    return toResult(e);
  }

  revalidateProposalPaths(projectId, { projectViews: true });
  return { ok: true };
}
