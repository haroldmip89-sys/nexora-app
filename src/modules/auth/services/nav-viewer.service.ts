import "server-only";
import { unstable_rethrow } from "next/navigation";
import { safeErrorLog } from "@/lib/safe-error-log";
import { getCurrentUser } from "@/modules/auth/services/current-user.service";
import { getSessionUserId } from "@/modules/auth/services/clerk-identity.service";
import type { NavViewer } from "@/modules/auth/types/nav-viewer.types";

/** Classifies the viewer for the global header. Never throws. */
export async function resolveNavViewer(): Promise<NavViewer> {
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    unstable_rethrow(error);
    console.error("resolveNavViewer: failed to read current user", safeErrorLog(error));
    return { kind: "degraded" };
  }
  if (user) return { kind: "user", role: user.role };

  try {
    const clerkUserId = await getSessionUserId();
    return clerkUserId ? { kind: "needs_onboarding" } : { kind: "visitor" };
  } catch (error) {
    unstable_rethrow(error);
    console.error("resolveNavViewer: failed to read session", safeErrorLog(error));
    return { kind: "visitor" };
  }
}
