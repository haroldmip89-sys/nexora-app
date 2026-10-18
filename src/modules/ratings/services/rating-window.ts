import { RATING_EDIT_WINDOW_DAYS } from "@/modules/ratings/types/rating.types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const RATING_EDIT_WINDOW_MS = RATING_EDIT_WINDOW_DAYS * DAY_MS;

export function getEditableUntil(createdAt: Date): Date {
  return new Date(createdAt.getTime() + RATING_EDIT_WINDOW_MS);
}

/** Editable while now < editableUntil (strict). daysLeft is 0 when not editable. */
export function getEditWindow(createdAt: Date, now: Date): { canEdit: boolean; daysLeft: number } {
  const remaining = getEditableUntil(createdAt).getTime() - now.getTime();
  if (remaining <= 0) return { canEdit: false, daysLeft: 0 };
  return { canEdit: true, daysLeft: Math.ceil(remaining / DAY_MS) };
}

/** Ratings with created_at > cutoff are still editable. */
export function getEditCutoff(now: Date): Date {
  return new Date(now.getTime() - RATING_EDIT_WINDOW_MS);
}
