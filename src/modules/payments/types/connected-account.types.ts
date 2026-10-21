import type { connectedAccountStatusEnum } from "@/modules/payments/schema/connected-accounts.table";
import type { ConnectedAccountErrorCode } from "@/modules/payments/services/connected-account-errors";

export type ConnectedAccountStatus = (typeof connectedAccountStatusEnum.enumValues)[number];

export const CONNECTED_ACCOUNT_STATUS_LABELS: Record<ConnectedAccountStatus, string> = {
  not_started: "Sin configurar",
  pending: "En revisión por Stripe",
  active: "Lista para recibir transferencias de prueba",
  restricted: "Requiere acción",
};

/** Minimal Stripe Accounts v2 snapshot used by the pure derivation (decoupled from the SDK type). */
export type ConnectedAccountSnapshot = {
  /** account.closed === true */
  closed: boolean;
  /** configuration.recipient.capabilities.stripe_balance.stripe_transfers.status (undefined without `include`). */
  transfersStatus:
    | "active"
    | "pending"
    | "rejected"
    | "restricted"
    | "unsupported"
    | (string & {})
    | undefined;
  /** Some requirements.entries[] is awaiting action from the user. */
  userActionRequired: boolean;
  /** Some entry (or the summary) has minimum_deadline.status === "past_due". */
  pastDue: boolean;
};

/** Page summary: no Stripe account id, email or any other Stripe data. */
export type ConnectedAccountOverview = {
  status: ConnectedAccountStatus;
  hasStripeAccount: boolean;
  statusSyncedAt: Date | null;
};

export type ConnectedAccountActionResult = {
  ok: false;
  code: ConnectedAccountErrorCode | "UNKNOWN";
  message: string;
};

export type RefreshConnectedAccountResult =
  | { ok: true; status: ConnectedAccountStatus }
  | ConnectedAccountActionResult;
