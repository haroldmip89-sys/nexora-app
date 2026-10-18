"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { parseProjectForm, readProjectFormValues } from "@/modules/projects/schemas/project.schema";
import { ProjectError, type ProjectErrorCode } from "@/modules/projects/services/project-errors";
import {
  closeProject,
  createProject,
  publishProject,
  unpublishProject,
  updateProject,
} from "@/modules/projects/services/project.service";
import type {
  ProjectActionResult,
  ProjectFormState,
  ProjectFormValues,
} from "@/modules/projects/types/project.types";

const LIST_PATH = "/dashboard/projects";

const PROJECT_ERROR_MESSAGES: Record<ProjectErrorCode, string> = {
  INVALID_STATE: "El proyecto ya no está en un estado que permita esta acción.",
  HAS_PROPOSALS: "No puedes despublicar un proyecto que ya recibió propuestas.",
  LOCKED_FIELDS:
    "Con el proyecto publicado solo puedes editar el título, la descripción y las tecnologías.",
  INVALID_PROJECT: "El proyecto no cumple los requisitos para publicarse. Edítalo e inténtalo de nuevo.",
  INVALID_TECHNOLOGY: "Selecciona tecnologías de la lista.",
  PAYMENT_IN_PROGRESS: "No puedes cerrar el proyecto mientras haya un pago en curso.",
};

const NOT_FOUND_MESSAGE = "No encontramos el proyecto.";
const GENERIC_MESSAGE = "No pudimos completar la acción. Inténtalo de nuevo.";

const uuidSchema = z.uuid();

function isValidId(projectId: unknown): projectId is string {
  return uuidSchema.safeParse(projectId).success;
}

function formError(
  formData: FormData,
  message: string,
  fieldErrors: Extract<ProjectFormState, { status: "error" }>["fieldErrors"] = {},
  values: ProjectFormValues = readProjectFormValues(formData),
): ProjectFormState {
  return { status: "error", message, fieldErrors, values };
}

/** Translates a service/unknown error into a form state. Auth errors other than NOT_FOUND redirect/404. */
function toFormState(error: unknown, formData: FormData): ProjectFormState {
  if (error instanceof ProjectError) {
    const message = PROJECT_ERROR_MESSAGES[error.code];
    if (error.code === "INVALID_TECHNOLOGY") {
      return formError(formData, "Revisa los campos marcados.", { technologies: message });
    }
    return formError(formData, message);
  }
  if (error instanceof AuthError) {
    if (error.code === "NOT_FOUND") return formError(formData, NOT_FOUND_MESSAGE);
    handleAuthErrorForPage(error);
  }
  return formError(formData, GENERIC_MESSAGE);
}

function toResult(error: unknown): ProjectActionResult {
  if (error instanceof ProjectError) {
    return { ok: false, code: error.code, message: PROJECT_ERROR_MESSAGES[error.code] };
  }
  if (error instanceof AuthError) {
    if (error.code === "NOT_FOUND") return { ok: false, code: "NOT_FOUND", message: NOT_FOUND_MESSAGE };
    handleAuthErrorForPage(error);
  }
  return { ok: false, code: "UNKNOWN", message: GENERIC_MESSAGE };
}

function wantsPublish(formData: FormData): boolean {
  return formData.get("intent") === "publish";
}

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  let actor;
  try {
    actor = await requireRole("client");
  } catch (e) {
    handleAuthErrorForPage(e);
  }

  const parsed = parseProjectForm(formData);
  if (!parsed.success) {
    return formError(formData, "Revisa los campos marcados.", parsed.fieldErrors, parsed.values);
  }

  try {
    await createProject(actor, parsed.data, { publish: wantsPublish(formData) });
  } catch (e) {
    return toFormState(e, formData);
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

export async function updateProjectAction(
  projectId: string,
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  let actor;
  try {
    actor = await requireRole("client");
  } catch (e) {
    handleAuthErrorForPage(e);
  }

  if (!isValidId(projectId)) return formError(formData, NOT_FOUND_MESSAGE);

  const parsed = parseProjectForm(formData);
  if (!parsed.success) {
    return formError(formData, "Revisa los campos marcados.", parsed.fieldErrors, parsed.values);
  }

  try {
    await updateProject(actor, projectId, parsed.data);
    if (wantsPublish(formData)) await publishProject(actor, projectId);
  } catch (e) {
    // Changes already saved as draft stay saved (non-atomic publish, accepted by the spec).
    revalidatePath(LIST_PATH);
    revalidatePath(`/projects/${projectId}/edit`);
    return toFormState(e, formData);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`/projects/${projectId}/edit`);
  redirect(LIST_PATH);
}

async function runLifecycle(
  projectId: string,
  roles: Parameters<typeof requireRole>,
  operation: typeof publishProject,
): Promise<ProjectActionResult> {
  let actor;
  try {
    actor = await requireRole(...roles);
  } catch (e) {
    handleAuthErrorForPage(e);
  }

  if (!isValidId(projectId)) {
    return { ok: false, code: "NOT_FOUND", message: NOT_FOUND_MESSAGE };
  }

  try {
    await operation(actor, projectId);
  } catch (e) {
    return toResult(e);
  }

  revalidatePath(LIST_PATH);
  revalidatePath(`/projects/${projectId}/edit`);
  return { ok: true };
}

export async function publishProjectAction(projectId: string): Promise<ProjectActionResult> {
  return runLifecycle(projectId, ["client"], publishProject);
}

export async function unpublishProjectAction(projectId: string): Promise<ProjectActionResult> {
  return runLifecycle(projectId, ["client"], unpublishProject);
}

export async function closeProjectAction(projectId: string): Promise<ProjectActionResult> {
  return runLifecycle(projectId, ["client", "admin"], closeProject);
}
