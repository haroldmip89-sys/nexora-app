import type { Role } from "@/modules/auth/types/auth.types";
import type { ProfileLink } from "@/modules/users/schema/developer-profiles.table";

export type { ProfileLink };
export type ProfileLinkType = ProfileLink["type"];
export type DeveloperAvailability = "available" | "partial" | "unavailable";
export type ContactVisibility = "accepted_client" | "any_client" | "nobody";
export type ContactState = "visible" | "hidden_by_owner" | "restricted" | "none";
export type ProfileViewer = { id: string; role: Role };

export const PROFILE_LIMITS = {
  headline: { min: 1, max: 80 },
  location: { max: 80 },
  bio: { max: 1000 },
  links: { maxItems: 5, urlMax: 300 },
  contactEmail: { max: 254 },
} as const;

export const AVAILABILITY_LABELS: Record<DeveloperAvailability, string> = {
  available: "Disponible",
  partial: "Disponible parcialmente",
  unavailable: "No disponible",
};

export const LINK_TYPE_LABELS: Record<ProfileLinkType, string> = {
  github: "GitHub",
  linkedin: "LinkedIn",
  portfolio: "Portafolio",
  other: "Otro",
};

export const CONTACT_VISIBILITY_LABELS: Record<ContactVisibility, string> = {
  accepted_client: "Solo clientes que me contrataron (recomendado)",
  any_client: "Cualquier cliente con sesión iniciada",
  nobody: "Nadie",
};

/** Form/DB shape owned by the developer (editor). Never includes users.email. */
export type OwnDeveloperProfile = {
  displayName: string; // read-only, from users
  headline: string;
  location: string;
  availability: DeveloperAvailability;
  bio: string;
  links: ProfileLink[];
  contactEmail: string;
  contactVisibility: ContactVisibility;
  hasProfile: boolean; // false until first save (D10)
};

/** Public DTO. contactEmail is ALREADY resolved server-side (D2, D16): string only if the viewer may see it. */
export type PublicDeveloperProfile = {
  userId: string;
  displayName: string;
  initials: string;
  hasProfile: boolean;
  headline: string | null;
  location: string | null;
  availability: DeveloperAvailability | null;
  bio: string | null;
  links: ProfileLink[];
  contactEmail: string | null;
  contactState: ContactState;
};

export type DeveloperProfileFieldName =
  | "headline"
  | "location"
  | "availability"
  | "bio"
  | "links"
  | "contactEmail"
  | "contactVisibility";
export type DeveloperProfileFieldErrors = Partial<Record<DeveloperProfileFieldName, string>>;
export type SaveDeveloperProfileResult =
  | { ok: true }
  | { ok: false; code: "VALIDATION"; fieldErrors: DeveloperProfileFieldErrors }
  | { ok: false; code: "UNKNOWN"; message: string };

/** Contract for spec 020 (declared here ONLY; 020 imports it, never redeclares it). */
export type DeveloperRatingSummary = { average: number | null; count: number };
