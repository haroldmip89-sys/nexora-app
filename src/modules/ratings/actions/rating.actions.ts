"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { ratingInputSchema } from "@/modules/ratings/schemas/rating.schema";
import { RATING_ERROR_MESSAGES, RatingError } from "@/modules/ratings/services/rating-errors";
import {
  createDeveloperRating,
  updateDeveloperRating,
} from "@/modules/ratings/services/rating.service";
import type {
  RatingFieldErrors,
  RatingFormState,
  RatingFormValues,
} from "@/modules/ratings/types/rating.types";

const NOT_FOUND_MESSAGE = "No encontramos el proyecto.";
const GENERIC_MESSAGE = "No pudimos completar la acción. Inténtalo de nuevo.";

function errorState(
  message: string | undefined,
  values: RatingFormValues,
  fieldErrors: RatingFieldErrors = {},
): RatingFormState {
  return { status: "error", message, fieldErrors, values };
}

async function submitRating(
  mode: "create" | "update",
  projectId: string,
  formData: FormData,
): Promise<RatingFormState> {
  const values: RatingFormValues = {
    rating: String(formData.get("rating") ?? ""),
    comment: String(formData.get("comment") ?? ""),
  };

  let actor;
  try {
    actor = await requireRole("client");
  } catch (e) {
    unstable_rethrow(e);
    return handleAuthErrorForPage(e);
  }

  if (!z.uuid().safeParse(projectId).success) return errorState(NOT_FOUND_MESSAGE, values);

  const parsed = ratingInputSchema.safeParse({
    rating: formData.get("rating"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: RatingFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === "rating" || key === "comment") && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return errorState(undefined, values, fieldErrors);
  }

  let developerId: string;
  try {
    const save = mode === "create" ? createDeveloperRating : updateDeveloperRating;
    ({ developerId } = await save(actor, projectId, parsed.data));
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof RatingError) return errorState(RATING_ERROR_MESSAGES[e.code], values);
    if (e instanceof AuthError) {
      if (e.code === "NOT_FOUND") return errorState(NOT_FOUND_MESSAGE, values);
      handleAuthErrorForPage(e);
    }
    // Never log the error object or the comment.
    console.error("rating action failed");
    return errorState(GENERIC_MESSAGE, values);
  }

  revalidatePath(`/projects/${projectId}/rate`);
  revalidatePath(`/developers/${developerId}`);
  revalidatePath("/dashboard/account");
  return { status: "success" };
}

export async function createDeveloperRatingAction(
  projectId: string,
  _prev: RatingFormState,
  formData: FormData,
): Promise<RatingFormState> {
  return submitRating("create", projectId, formData);
}

export async function updateDeveloperRatingAction(
  projectId: string,
  _prev: RatingFormState,
  formData: FormData,
): Promise<RatingFormState> {
  return submitRating("update", projectId, formData);
}
