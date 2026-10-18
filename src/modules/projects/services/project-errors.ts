/**
 * Domain errors of the projects module. Authorization failures (FORBIDDEN,
 * NOT_FOUND, ...) are NOT duplicated here: they stay as `AuthError`
 * (`@/modules/auth/services/auth-errors`).
 */
export type ProjectErrorCode =
  | "INVALID_STATE"
  | "HAS_PROPOSALS"
  | "LOCKED_FIELDS"
  | "INVALID_PROJECT"
  | "INVALID_TECHNOLOGY"
  | "PAYMENT_IN_PROGRESS";

export type ProjectErrorStatus = 409 | 422;

export const PROJECT_ERROR_STATUS: Record<ProjectErrorCode, ProjectErrorStatus> = {
  INVALID_STATE: 409,
  HAS_PROPOSALS: 409,
  LOCKED_FIELDS: 409,
  INVALID_PROJECT: 422,
  INVALID_TECHNOLOGY: 422,
  PAYMENT_IN_PROGRESS: 409,
};

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  readonly status: ProjectErrorStatus;

  constructor(code: ProjectErrorCode) {
    super(code);
    this.name = "ProjectError";
    this.code = code;
    this.status = PROJECT_ERROR_STATUS[code];
  }
}
