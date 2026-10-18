import type { DeveloperRatingSummary } from "@/modules/profile/types/developer-profile.types"; // type-only; NOT redeclared

export type { DeveloperRatingSummary };

export const RATING_COMMENT_MAX = 600;
export const RATING_EDIT_WINDOW_DAYS = 14;

export type RatingFormValues = { rating: string; comment: string };
export type RatingFieldErrors = Partial<Record<"rating" | "comment", string>>;
export type RatingFormState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message?: string; fieldErrors: RatingFieldErrors; values: RatingFormValues };

/** What the owning client sees for a project (never ids of developer/client, email, Stripe data). */
export type ProjectRatingView = {
  project: { id: string; title: string };
  developerName: string;
  previewName: string; // the client's own abbreviated name (server-computed), for "Antes de enviar"
  rating: null | {
    rating: number;
    comment: string | null;
    createdAt: Date;
    canEdit: boolean;
    daysLeft: number; // 0 when !canEdit
  };
  canCreate: boolean; // contracted, not yet rated
};

/** Public DTO (profile list). No ids, no email, no full surname. */
export type PublicDeveloperRating = {
  rating: number;
  comment: string | null;
  clientName: string;
  createdAt: Date;
};
