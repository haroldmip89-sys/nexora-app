export type Role = "client" | "developer" | "admin";

export type AuthUser = {
  id: string;
  clerkUserId: string;
  role: Role;
  displayName: string;
  email: string;
};

export type Action =
  | "catalog.view"
  | "project.create"
  | "project.update"
  | "project.publish"
  | "project.close"
  | "project.readPrivate"
  | "proposal.create"
  | "proposal.withdraw"
  | "proposal.read"
  | "proposal.select"
  | "payment.start"
  | "payment.read";

export type AuthErrorCode = "UNAUTHENTICATED" | "ONBOARDING_REQUIRED" | "FORBIDDEN" | "NOT_FOUND";

export type AuthErrorStatus = 401 | 403 | 404;

export const AUTH_ERROR_STATUS: Record<AuthErrorCode, AuthErrorStatus> = {
  UNAUTHENTICATED: 401,
  ONBOARDING_REQUIRED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
};
