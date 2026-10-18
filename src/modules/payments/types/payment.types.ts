import type { paymentAttemptStatusEnum } from "@/modules/payments/schema/payment-attempts.table";
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
  proposal: { developerName: string; priceCents: number; currency: "USD"; timelineWeeks: number };
  /** Most recent attempt by created_at. */
  attempt: {
    status: PaymentAttemptStatus;
    amountCents: number;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  canStart: boolean;
  canResume: boolean;
};

export type PaymentActionResult = {
  ok: false;
  code: PaymentErrorCode | "NOT_FOUND" | "UNKNOWN";
  message: string;
};
