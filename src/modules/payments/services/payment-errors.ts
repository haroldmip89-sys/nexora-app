/**
 * Domain errors of the payments module. Authorization failures (FORBIDDEN,
 * NOT_FOUND, ...) are NOT duplicated here: they stay as `AuthError`
 * (`@/modules/auth/services/auth-errors`).
 */
export type PaymentErrorCode =
  | "PAYMENT_NOT_ALLOWED"
  | "PAYMENT_ALREADY_ACTIVE"
  | "DEVELOPER_PAYOUTS_NOT_READY"
  | "STRIPE_UNAVAILABLE"
  | "STRIPE_NOT_CONFIGURED";

export type PaymentErrorStatus = 409 | 502 | 503;

export const PAYMENT_ERROR_STATUS: Record<PaymentErrorCode, PaymentErrorStatus> = {
  PAYMENT_NOT_ALLOWED: 409,
  PAYMENT_ALREADY_ACTIVE: 409,
  DEVELOPER_PAYOUTS_NOT_READY: 409,
  STRIPE_UNAVAILABLE: 502,
  STRIPE_NOT_CONFIGURED: 503,
};

/** User-facing message (es) per domain error code. */
export const PAYMENT_ERROR_MESSAGES: Record<PaymentErrorCode, string> = {
  PAYMENT_NOT_ALLOWED: "Este proyecto no está listo para el pago de prueba.",
  PAYMENT_ALREADY_ACTIVE:
    "Ya hay un pago de prueba en curso, pendiente de confirmación del servidor.",
  DEVELOPER_PAYOUTS_NOT_READY:
    "El desarrollador aún no configuró sus cobros de prueba. Podrás pagar cuando lo haga.",
  STRIPE_UNAVAILABLE: "No pudimos conectar con Stripe. Inténtalo de nuevo en unos minutos.",
  STRIPE_NOT_CONFIGURED: "El pago de prueba no está disponible en este entorno.",
};

export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  readonly status: PaymentErrorStatus;

  constructor(code: PaymentErrorCode) {
    super(code);
    this.name = "PaymentError";
    this.code = code;
    this.status = PAYMENT_ERROR_STATUS[code];
  }
}
