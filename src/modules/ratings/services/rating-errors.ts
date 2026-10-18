/**
 * Domain errors of the ratings module. Authorization failures (FORBIDDEN,
 * NOT_FOUND) stay as `AuthError` (`@/modules/auth/services/auth-errors`).
 */
export type RatingErrorCode =
  | "NOT_CONTRACTED"
  | "ALREADY_RATED"
  | "EDIT_WINDOW_CLOSED"
  | "RATING_NOT_FOUND";

export type RatingErrorStatus = 409;

export const RATING_ERROR_STATUS: Record<RatingErrorCode, RatingErrorStatus> = {
  NOT_CONTRACTED: 409,
  ALREADY_RATED: 409,
  EDIT_WINDOW_CLOSED: 409,
  RATING_NOT_FOUND: 409,
};

/** User-facing message (es) per domain error code. */
export const RATING_ERROR_MESSAGES: Record<RatingErrorCode, string> = {
  NOT_CONTRACTED: "Solo puedes valorar a un desarrollador cuando el proyecto ya fue contratado.",
  ALREADY_RATED: "Ya valoraste a este desarrollador en este proyecto. Puedes editar tu valoración.",
  EDIT_WINDOW_CLOSED: "Ya pasaron los 14 días para editar esta valoración.",
  RATING_NOT_FOUND: "Aún no valoraste a este desarrollador.",
};

export class RatingError extends Error {
  readonly code: RatingErrorCode;
  readonly status: RatingErrorStatus;

  constructor(code: RatingErrorCode) {
    super(code);
    this.name = "RatingError";
    this.code = code;
    this.status = RATING_ERROR_STATUS[code];
  }
}
