"use server";

import { redirect } from "next/navigation";
import { getClerkProfile, getSessionUserId } from "@/modules/auth/services/clerk-identity.service";
import { onboardingSchema } from "@/modules/auth/schemas/onboarding.schema";
import { registerUser } from "@/modules/users/services/users.service";

export type CompleteOnboardingResult = { error: string };

/**
 * Creates the internal user for the Clerk session. Identity (id, email, name) comes from Clerk on
 * the server; only the role comes from the input, validated as client|developer. Idempotent: an
 * existing row keeps its role (D1). redirect() throws by design, so it is never inside a try/catch.
 */
export async function completeOnboarding(input: unknown): Promise<CompleteOnboardingResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { error: "Selecciona un rol válido." };

  const clerkUserId = await getSessionUserId();
  if (!clerkUserId) redirect("/sign-in");

  const profile = await getClerkProfile();
  if (!profile) {
    return { error: "No pudimos obtener los datos de tu cuenta. Inténtalo de nuevo." };
  }

  try {
    await registerUser({
      clerkUserId,
      role: parsed.data.role,
      displayName: profile.displayName,
      email: profile.email,
      imageUrl: profile.imageUrl,
    });
  } catch {
    return { error: "No pudimos completar tu registro. Inténtalo de nuevo." };
  }

  redirect("/");
}
