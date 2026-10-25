import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { normalizeClerkImageUrl } from "@/lib/clerk-image";

export type ClerkProfile = { displayName: string; email: string; imageUrl: string | null };

type NameParts = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
};

/** "first last" trimmed; falls back to username, then the email local part. */
export function deriveDisplayName({ firstName, lastName, username, email }: NameParts): string {
  const fullName = [firstName, lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  if (fullName) return fullName;
  const user = username?.trim();
  if (user) return user;
  return email?.split("@")[0]?.trim() ?? "";
}

type EmailEntry = { id: string; emailAddress?: string; email_address?: string };

/** Primary email from SDK (camelCase) or webhook (snake_case) lists; null when absent. */
export function pickPrimaryEmail(
  emails: readonly EmailEntry[] | null | undefined,
  primaryId: string | null | undefined,
): string | null {
  if (!emails || !primaryId) return null;
  const entry = emails.find((e) => e.id === primaryId);
  return entry?.emailAddress ?? entry?.email_address ?? null;
}

export async function getSessionUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

export async function getClerkProfile(): Promise<ClerkProfile | null> {
  const user = await currentUser();
  if (!user) return null;
  const email = user.primaryEmailAddress?.emailAddress ?? null;
  if (!email) return null;
  return {
    email,
    displayName: deriveDisplayName({
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email,
    }),
    imageUrl: normalizeClerkImageUrl(user.imageUrl, user.hasImage),
  };
}
