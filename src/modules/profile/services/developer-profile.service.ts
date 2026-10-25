import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { projects } from "@/modules/projects/schema/projects.table";
import type { DeveloperProfileInput } from "@/modules/profile/schemas/developer-profile.schema";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { getInitials } from "@/modules/profile/services/avatar-initials";
import { resolveContactEmail } from "@/modules/profile/services/contact-visibility";
import type {
  OwnDeveloperProfile,
  ProfileViewer,
  PublicDeveloperProfile,
} from "@/modules/profile/types/developer-profile.types";
import { developerProfiles } from "@/modules/users/schema/developer-profiles.table";
import { users } from "@/modules/users/schema/users.table";
import { DELETED_EMAIL_DOMAIN } from "@/modules/users/services/users.service";

const uuidSchema = z.uuid();

/** Own profile for the editor. Keyed only by actor.id; never selects users.email. No writes. */
export async function getOwnProfile(actor: AuthUser): Promise<OwnDeveloperProfile> {
  if (!can(actor.role, "profile.edit")) throw new AuthError("FORBIDDEN");

  const [row] = await db
    .select({
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      headline: developerProfiles.headline,
      location: developerProfiles.location,
      availability: developerProfiles.availability,
      bio: developerProfiles.bio,
      links: developerProfiles.links,
      contactEmail: developerProfiles.contactEmail,
      contactVisibility: developerProfiles.contactVisibility,
      profileUserId: developerProfiles.userId,
    })
    .from(users)
    .leftJoin(developerProfiles, eq(developerProfiles.userId, users.id))
    .where(eq(users.id, actor.id))
    .limit(1);
  if (!row) throw new AuthError("NOT_FOUND");

  const hasProfile = row.profileUserId !== null;
  return {
    displayName: row.displayName,
    imageUrl: row.imageUrl,
    headline: row.headline ?? "",
    location: row.location ?? "",
    availability: row.availability ?? "available",
    bio: row.bio ?? "",
    links: row.links ?? [],
    contactEmail: row.contactEmail ?? "",
    contactVisibility: row.contactVisibility ?? "accepted_client",
    hasProfile,
  };
}

/** Idempotent upsert of the actor's own row; technologies and external_url are untouched. */
export async function saveOwnProfile(
  actor: AuthUser,
  input: DeveloperProfileInput,
): Promise<void> {
  if (!can(actor.role, "profile.edit")) throw new AuthError("FORBIDDEN");

  const values = {
    headline: input.headline,
    location: input.location,
    availability: input.availability,
    bio: input.bio,
    links: input.links,
    contactEmail: input.contactEmail,
    contactVisibility: input.contactVisibility,
  };
  await db
    .insert(developerProfiles)
    .values({ userId: actor.id, ...values })
    .onConflictDoUpdate({
      target: developerProfiles.userId,
      set: { ...values, updatedAt: new Date() },
    });
}

async function hasAcceptedProposalWith(ownerId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: proposals.id })
    .from(proposals)
    .innerJoin(projects, eq(projects.id, proposals.projectId))
    .where(
      and(
        eq(proposals.status, "accepted"),
        eq(proposals.developerId, ownerId),
        eq(projects.clientId, clientId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Public profile for /developers/[id]. Explicit projection: no users.email, no clerk id, no role. */
export async function getPublicDeveloperProfile(
  developerId: string,
  viewer: ProfileViewer | null,
): Promise<PublicDeveloperProfile | null> {
  if (!uuidSchema.safeParse(developerId).success) return null;

  const [row] = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      isAnonymized: sql<boolean>`${users.email} like ${"%" + DELETED_EMAIL_DOMAIN}`,
      profileUserId: developerProfiles.userId,
      headline: developerProfiles.headline,
      location: developerProfiles.location,
      availability: developerProfiles.availability,
      bio: developerProfiles.bio,
      links: developerProfiles.links,
      contactEmail: developerProfiles.contactEmail,
      contactVisibility: developerProfiles.contactVisibility,
    })
    .from(users)
    .leftJoin(developerProfiles, eq(developerProfiles.userId, users.id))
    .where(and(eq(users.id, developerId), eq(users.role, "developer")))
    .limit(1);
  if (!row) return null;

  const initials = getInitials(row.displayName);
  const imageUrl = row.isAnonymized ? null : row.imageUrl;
  if (row.profileUserId === null) {
    return {
      userId: row.userId,
      displayName: row.displayName,
      initials,
      imageUrl,
      hasProfile: false,
      headline: null,
      location: null,
      availability: null,
      bio: null,
      links: [],
      contactEmail: null,
      contactState: "none",
    };
  }

  const visibility = row.contactVisibility ?? "accepted_client";
  const storedEmail = row.isAnonymized ? null : row.contactEmail;
  const needsLookup =
    visibility === "accepted_client" && Boolean(storedEmail) && viewer?.role === "client";
  const accepted = needsLookup && viewer ? await hasAcceptedProposalWith(row.userId, viewer.id) : false;

  const contact = resolveContactEmail({
    contactEmail: storedEmail,
    visibility,
    viewer,
    ownerId: row.userId,
    viewerHasAcceptedProposalWithOwner: accepted,
  });

  return {
    userId: row.userId,
    displayName: row.displayName,
    initials,
    imageUrl,
    hasProfile: true,
    headline: row.headline,
    location: row.location,
    availability: row.availability,
    bio: row.bio,
    links: row.links ?? [],
    contactEmail: contact.email,
    contactState: contact.state,
  };
}
