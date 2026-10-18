/**
 * Domain errors of connected accounts (spec 011a). Authorization failures stay as `AuthError`
 * (`@/modules/auth/services/auth-errors`).
 */
export type ConnectedAccountErrorCode =
  | "STRIPE_NOT_CONFIGURED"
  | "STRIPE_UNAVAILABLE"
  | "ACCOUNT_ALREADY_ACTIVE"
  | "ACCOUNT_UNAVAILABLE";

export type ConnectedAccountErrorStatus = 409 | 502 | 503;

export const CONNECTED_ACCOUNT_ERROR_STATUS: Record<
  ConnectedAccountErrorCode,
  ConnectedAccountErrorStatus
> = {
  STRIPE_NOT_CONFIGURED: 503,
  STRIPE_UNAVAILABLE: 502,
  ACCOUNT_ALREADY_ACTIVE: 409,
  ACCOUNT_UNAVAILABLE: 409,
};

/** User-facing message (es) per domain error code. */
export const CONNECTED_ACCOUNT_ERROR_MESSAGES: Record<ConnectedAccountErrorCode, string> = {
  STRIPE_NOT_CONFIGURED: "Los cobros de prueba no están disponibles en este entorno.",
  STRIPE_UNAVAILABLE: "No pudimos conectar con Stripe. Inténtalo de nuevo en unos minutos.",
  ACCOUNT_ALREADY_ACTIVE: "Tu cuenta de cobros de prueba ya está activa.",
  ACCOUNT_UNAVAILABLE:
    "No encontramos tu cuenta de cobros de prueba en Stripe. Contacta con el administrador.",
};

export class ConnectedAccountError extends Error {
  readonly code: ConnectedAccountErrorCode;
  readonly status: ConnectedAccountErrorStatus;

  constructor(code: ConnectedAccountErrorCode) {
    super(code);
    this.name = "ConnectedAccountError";
    this.code = code;
    this.status = CONNECTED_ACCOUNT_ERROR_STATUS[code];
  }
}
