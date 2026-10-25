import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { normalizeClerkImageUrl } from "@/lib/clerk-image";
import { safeErrorLog } from "@/lib/safe-error-log";
import { syncImageUrl } from "@/modules/users/services/users.service";

/**
 * Refreshes the stored photo URL of the signed-in developer from Clerk. Never throws: a Clerk or DB
 * failure is logged with safeErrorLog only (the URL is personal data and is never logged).
 */
export async function refreshOwnImage(clerkUserId: string): Promise<void> {
  try {
    const user = await currentUser();
    if (!user) return;
    await syncImageUrl(clerkUserId, normalizeClerkImageUrl(user.imageUrl, user.hasImage));
  } catch (error) {
    console.error("refreshOwnImage failed", safeErrorLog(error));
  }
}
