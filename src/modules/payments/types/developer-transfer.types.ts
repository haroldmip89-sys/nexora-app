import type { developerTransferStatusEnum } from "@/modules/payments/schema/developer-transfers.table";

export type DeveloperTransferStatus = (typeof developerTransferStatusEnum.enumValues)[number];

export const DEVELOPER_TRANSFER_STATUS_LABELS: Record<DeveloperTransferStatus, string> = {
  pending: "Pendiente",
  completed_test: "Completada en Test Mode",
  failed: "Fallida",
};

export const TRANSFER_TEST_NOTICE = "Transferencia de prueba, no es dinero real";

/** Code stored in `last_error_code`. */
export type TransferReason =
  | "ACCOUNT_NOT_ACTIVE"
  | "ACCOUNT_SYNC_FAILED"
  | "PAYMENT_NOT_SETTLED"
  | "STRIPE_UNAVAILABLE"
  | "STRIPE_NOT_CONFIGURED"
  | "INVALID_RESPONSE"
  | "STRIPE_REJECTED"
  | "LIVEMODE_REJECTED";

export const TRANSFER_REASON_MESSAGES: Record<TransferReason, string> = {
  ACCOUNT_NOT_ACTIVE: "Tu cuenta de cobros aún no está activa. Completa el onboarding para recibir la transferencia de prueba.",
  ACCOUNT_SYNC_FAILED: "No pudimos verificar tu cuenta de cobros. Inténtalo de nuevo en unos minutos.",
  PAYMENT_NOT_SETTLED: "El pago aún no está liquidado. Inténtalo de nuevo en unos minutos.",
  STRIPE_UNAVAILABLE: "El proveedor de pagos no respondió. Puedes reintentar la transferencia.",
  STRIPE_NOT_CONFIGURED: "Los pagos de prueba no están configurados en este momento.",
  INVALID_RESPONSE: "Recibimos una respuesta inesperada del proveedor de pagos. Puedes reintentar la transferencia.",
  STRIPE_REJECTED: "El proveedor de pagos rechazó la transferencia de prueba. Puedes reintentarla.",
  LIVEMODE_REJECTED: "La transferencia se rechazó porque no está en Test Mode.",
};

export type TransferExecutionResult =
  | { status: "completed_test" }
  | { status: "pending"; reason: TransferReason }
  | { status: "failed"; reason: TransferReason }
  | { status: "noop" };

export type RetryTransfersResult = {
  attempted: number;
  completed: number;
  pending: number;
  failed: number;
};

/** Client view: status only. No ids, no amounts beyond the payment's, no developer data. */
export type ProjectTransferSummary = {
  status: DeveloperTransferStatus;
  completedAt: Date | null;
  reason: TransferReason | null;
};

/** Developer view (own transfers only). */
export type DeveloperTransferItem = {
  id: string;
  projectTitle: string;
  amountCents: number;
  status: DeveloperTransferStatus;
  reason: TransferReason | null;
  createdAt: Date;
  completedAt: Date | null;
};

/** Authorization failures go through handleAuthErrorForPage. */
export type TransferActionResult = { ok: false; code: "UNKNOWN"; message: string };

export type RetryTransfersActionResult =
  | ({ ok: true } & RetryTransfersResult)
  | TransferActionResult;
