"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import {
  developerProfileInputSchema,
  toDeveloperProfileFieldErrors,
} from "@/modules/profile/schemas/developer-profile.schema";
import { saveOwnProfile } from "@/modules/profile/services/developer-profile.service";
import type { SaveDeveloperProfileResult } from "@/modules/profile/types/developer-profile.types";

const UNKNOWN_MESSAGE = "No pudimos guardar tu perfil. Inténtalo de nuevo.";

async function requireDeveloper() {
  try {
    return await requireRole("developer");
  } catch (e) {
    unstable_rethrow(e);
    return handleAuthErrorForPage(e);
  }
}

/** Saves the signed-in developer's own profile (spec 019 RF3). The row is always `actor.id`. */
export async function saveDeveloperProfileAction(
  input: unknown,
): Promise<SaveDeveloperProfileResult> {
  const actor = await requireDeveloper();

  const parsed = developerProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      fieldErrors: toDeveloperProfileFieldErrors(parsed.error),
    };
  }

  try {
    await saveOwnProfile(actor, parsed.data);
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AuthError) handleAuthErrorForPage(e);
    // Never log the error object or profile content (may carry PII such as the contact email).
    console.error("saveDeveloperProfileAction failed");
    return { ok: false, code: "UNKNOWN", message: UNKNOWN_MESSAGE };
  }

  revalidatePath("/dashboard/account");
  revalidatePath(`/developers/${actor.id}`);
  return { ok: true };
}
