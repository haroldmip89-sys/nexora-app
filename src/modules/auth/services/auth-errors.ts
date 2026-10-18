import { notFound, redirect } from "next/navigation";
import {
  AUTH_ERROR_STATUS,
  type AuthErrorCode,
  type AuthErrorStatus,
} from "@/modules/auth/types/auth.types";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: AuthErrorStatus;

  constructor(code: AuthErrorCode) {
    super(code);
    this.name = "AuthError";
    this.code = code;
    this.status = AUTH_ERROR_STATUS[code];
  }
}

/** For route handlers. Rethrows anything that is not an AuthError. */
export function authErrorToResponse(error: unknown): Response {
  if (!(error instanceof AuthError)) throw error;
  return Response.json({ error: error.code }, { status: error.status });
}

/** For pages and server actions. redirect()/notFound() throw by design. */
export function handleAuthErrorForPage(error: unknown): never {
  if (!(error instanceof AuthError)) throw error;
  switch (error.code) {
    case "UNAUTHENTICATED":
      return redirect("/sign-in");
    case "ONBOARDING_REQUIRED":
      return redirect("/onboarding");
    default:
      return notFound();
  }
}
