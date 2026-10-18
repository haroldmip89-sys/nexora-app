import "server-only";
import { and, eq, not, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/modules/users/schema/users.table";

export type AuthUserRow = typeof users.$inferSelect;

export const DELETED_EMAIL_DOMAIN = "@deleted.invalid";
export const DELETED_DISPLAY_NAME = "Deleted user";

export async function findByClerkUserId(clerkUserId: string): Promise<AuthUserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  return row ?? null;
}

/**
 * Idempotent sign-up. INSERT ... ON CONFLICT (clerk_user_id) DO NOTHING; when nothing was
 * inserted the existing row is returned and its role is never changed (D1).
 */
export async function registerUser(input: {
  clerkUserId: string;
  role: "client" | "developer";
  displayName: string;
  email: string;
}): Promise<AuthUserRow> {
  const [inserted] = await db
    .insert(users)
    .values({
      clerkUserId: input.clerkUserId,
      role: input.role,
      displayName: input.displayName,
      email: input.email,
    })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();
  if (inserted) return inserted;

  const existing = await findByClerkUserId(input.clerkUserId);
  if (!existing) throw new Error("registerUser: row missing after conflict");
  return existing;
}

/** Updates only display_name and email. No-op when the row is missing or anonymized. */
export async function syncProfile(
  clerkUserId: string,
  p: { displayName: string; email: string },
): Promise<void> {
  await db
    .update(users)
    .set({ displayName: p.displayName, email: p.email })
    .where(
      and(
        eq(users.clerkUserId, clerkUserId),
        not(sql`${users.email} like ${"%" + DELETED_EMAIL_DOMAIN}`),
      ),
    );
}

/** Idempotent anonymization (keeps id, clerk_user_id, role and relations). */
export async function anonymizeByClerkUserId(clerkUserId: string): Promise<void> {
  await db
    .update(users)
    .set({
      displayName: DELETED_DISPLAY_NAME,
      email: sql`${users.id}::text || ${DELETED_EMAIL_DOMAIN}`,
    })
    .where(eq(users.clerkUserId, clerkUserId));
}
