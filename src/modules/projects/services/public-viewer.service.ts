import "server-only";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { getSessionUserId } from "@/modules/auth/services/clerk-identity.service";
import { getCurrentUser } from "@/modules/auth/services/current-user.service";
import { isProjectOwner } from "@/modules/projects/services/public-catalog.service";
import type { PublicViewer } from "@/modules/projects/types/public-project.types";

/**
 * Role-dependent state of the public detail page. Never throws for visitors;
 * an unexpected failure resolving the user degrades to "visitor" so the
 * public data stays readable.
 */
export async function resolvePublicViewer(projectId: string): Promise<PublicViewer> {
  try {
    const user = await getCurrentUser();
    if (user) {
      const isOwner = user.role === "client" && (await isProjectOwner(projectId, user.id));
      return { kind: "user", role: user.role, isOwner };
    }
    return (await getSessionUserId()) ? { kind: "needs_onboarding" } : { kind: "visitor" };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    console.error("resolvePublicViewer failed", error);
    return { kind: "visitor" };
  }
}
