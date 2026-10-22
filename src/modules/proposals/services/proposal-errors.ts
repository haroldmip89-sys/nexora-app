/**
 * Domain errors of the proposals module. Authorization failures (FORBIDDEN,
 * NOT_FOUND, ...) are NOT duplicated here: they stay as `AuthError`
 * (`@/modules/auth/services/auth-errors`).
 */
export type ProposalErrorCode =
  | "PROJECT_NOT_OPEN"
  | "ALREADY_PROPOSED"
  | "RESEND_NOT_ALLOWED"
  | "INVALID_STATE"
  | "ALREADY_SELECTED"
  | "PROPOSAL_CHANGED"
  | "PAYOUTS_NOT_READY";

export type ProposalErrorStatus = 409;

export const PROPOSAL_ERROR_STATUS: Record<ProposalErrorCode, ProposalErrorStatus> = {
  PROJECT_NOT_OPEN: 409,
  ALREADY_PROPOSED: 409,
  RESEND_NOT_ALLOWED: 409,
  INVALID_STATE: 409,
  ALREADY_SELECTED: 409,
  PROPOSAL_CHANGED: 409,
  PAYOUTS_NOT_READY: 409,
};

/** User-facing message (es) per domain error code. */
export const PROPOSAL_ERROR_MESSAGES: Record<ProposalErrorCode, string> = {
  PROJECT_NOT_OPEN: "Este proyecto ya no admite propuestas.",
  ALREADY_PROPOSED: "Ya enviaste una propuesta a este proyecto.",
  RESEND_NOT_ALLOWED: "Retiraste tu propuesta a este proyecto y no es posible enviar otra.",
  INVALID_STATE: "La propuesta ya no está pendiente y no se puede modificar.",
  ALREADY_SELECTED: "Este proyecto ya tiene una propuesta seleccionada.",
  PROPOSAL_CHANGED:
    "El desarrollador modificó la propuesta después de que la viste. Revisa los cambios y vuelve a elegir.",
  PAYOUTS_NOT_READY:
    "Configura tus cobros de prueba para poder enviar propuestas.",
};

/**
 * Messages (es) used by the selection flow. Complete over every code so the action never
 * indexes a gap; codes that selection never raises keep their generic wording.
 */
export const PROPOSAL_SELECTION_ERROR_MESSAGES: Record<ProposalErrorCode, string> = {
  ...PROPOSAL_ERROR_MESSAGES,
  PROJECT_NOT_OPEN: "Este proyecto ya no está abierto a la selección de propuestas.",
  INVALID_STATE:
    "Esta propuesta ya no está disponible para seleccionar (fue retirada o rechazada).",
};

export class ProposalError extends Error {
  readonly code: ProposalErrorCode;
  readonly status: ProposalErrorStatus;

  constructor(code: ProposalErrorCode) {
    super(code);
    this.name = "ProposalError";
    this.code = code;
    this.status = PROPOSAL_ERROR_STATUS[code];
  }
}
