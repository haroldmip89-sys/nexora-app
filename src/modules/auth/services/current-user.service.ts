import "server-only";
import { cache } from "react";
import { getSessionUserId } from "@/modules/auth/services/clerk-identity.service";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { findByClerkUserId } from "@/modules/users/services/users.service";
import type { AuthUser, Role } from "@/modules/auth/types/auth.types";

/** Session (Clerk) -> internal user (Neon). The role always comes from the DB row. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const clerkUserId = await getSessionUserId();
  if (!clerkUserId) return null;
  const row = await findByClerkUserId(clerkUserId);
  if (!row) return null;
  return {
    id: row.id,
    clerkUserId: row.clerkUserId,
    role: row.role,
    displayName: row.displayName,
    email: row.email,
  };
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (user) return user;
  const clerkUserId = await getSessionUserId();
  throw new AuthError(clerkUserId ? "ONBOARDING_REQUIRED" : "UNAUTHENTICATED");
}

export async function requireRole(...roles: Role[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthError("FORBIDDEN");
  return user;
}

/** Foreign private resources answer NOT_FOUND. allowAdmin is only for reads and project close (D8). */
export function requireOwnership(
  user: AuthUser,
  ownerUserId: string,
  opts: { allowAdmin?: boolean } = {},
): void {
  if (user.id === ownerUserId) return;
  if (opts.allowAdmin && user.role === "admin") return;
  throw new AuthError("NOT_FOUND");
}
