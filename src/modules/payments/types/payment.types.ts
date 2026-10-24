import type { paymentAttemptStatusEnum } from "@/modules/payments/schema/payment-attempts.table";
import type { ProjectTransferSummary } from "@/modules/payments/types/developer-transfer.types";
import type { PaymentErrorCode } from "@/modules/payments/services/payment-errors";
import type { ProjectStatus } from "@/modules/projects/types/project.types";

export type PaymentAttemptStatus = (typeof paymentAttemptStatusEnum.enumValues)[number];

export const PAYMENT_ATTEMPT_STATUS_LABELS: Record<PaymentAttemptStatus, string> = {
  pending: "Pendiente",
  completed_test: "Completado en Test Mode",
  failed: "Fallido",
  canceled: "Cancelado",
};

export type CheckoutStartResult = {
  attemptId: string;
  /** Stripe Checkout URL: only for redirect; never persisted nor shown. */
  checkoutUrl: string;
  /** true when an existing pending attempt was resumed/reused. */
  reused: boolean;
};

export type ProjectPaymentOverview = {
  project: { id: string; title: string; status: ProjectStatus };
  proposal: { developerId: string; developerName: string; priceCents: number; currency: "USD"; timelineWeeks: number };
  /** Most recent attempt by created_at. */
  attempt: {
    status: PaymentAttemptStatus;
    amountCents: number;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  canStart: boolean;
  /** The selected developer has an active connected account (cached status). */
  developerPayoutsReady: boolean;
  canResume: boolean;
  /** Transfer of the latest completed attempt; null if none exists. */
  transfer: ProjectTransferSummary | null;
};

export type PaymentActionResult = {
  ok: false;
  code: PaymentErrorCode | "NOT_FOUND" | "RATE_LIMITED" | "UNKNOWN";
  message: string;
};

export type AppliedReason = "completed" | "completed_project_not_selected" | "failed" | "canceled";

export type IgnoredReason =
  | "attempt_not_found"
  | "reference_mismatch"
  | "attempt_not_pending"
  | "payment_not_paid"
  | "amount_mismatch"
  | "currency_mismatch"
  | "missing_payment_intent";

/** What `handleStripeEvent` did with a verified event (spec 010 RF4). Every variant maps to a 2xx. */
export type StripeEventOutcome =
  | { result: "applied"; reason: AppliedReason }
  | { result: "ignored"; reason: IgnoredReason }
  | { result: "duplicate" }
  | { result: "unhandled" }
  | { result: "discarded"; reason: "livemode" };

export type ReconcileResult = { outcome: "completed" | "canceled" | "unchanged" | "none" };

export type RefreshActionResult =
  | { ok: true; outcome: ReconcileResult["outcome"] }
  | PaymentActionResult;

/**
 * canceled: the attempt is canceled (by this call, or already was after Stripe expired it).
 * completed: the payment completed first (lost race, or already completed_test); nothing canceled.
 * none: there was no pending attempt (none, or already failed/canceled).
 */
export type CancelPaymentResult = { outcome: "canceled" | "completed" | "none" };

export type CancelPaymentActionResult =
  | { ok: true; outcome: CancelPaymentResult["outcome"] }
  | PaymentActionResult;
