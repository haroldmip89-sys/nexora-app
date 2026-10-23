"use server";

import { revalidatePath } from "next/cache";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { startCheckoutInputSchema } from "@/modules/payments/schemas/payment.schema";
import { cancelPendingPayment } from "@/modules/payments/services/payment-cancellation.service";
import {
  PAYMENT_ERROR_MESSAGES,
  PaymentError,
} from "@/modules/payments/services/payment-errors";
import { RATE_LIMITED_MESSAGE, enforceRateLimit } from "@/modules/security/services/rate-limit.service";
import type {
  CancelPaymentActionResult,
  CancelPaymentResult,
} from "@/modules/payments/types/payment.types";

const NOT_FOUND_MESSAGE = "No encontramos el proyecto.";
const GENERIC_MESSAGE = "No pudimos completar la acción. Inténtalo de nuevo.";

function toResult(error: unknown): CancelPaymentActionResult {
  if (error instanceof PaymentError) {
    return { ok: false, code: error.code, message: PAYMENT_ERROR_MESSAGES[error.code] };
  }
  if (error instanceof AuthError) {
    if (error.code === "NOT_FOUND") return { ok: false, code: "NOT_FOUND", message: NOT_FOUND_MESSAGE };
    handleAuthErrorForPage(error);
  }
  return { ok: false, code: "UNKNOWN", message: GENERIC_MESSAGE };
}

/**
 * Cancels the client's pending test payment (spec 012). The browser contributes no state; Stripe
 * decides. The result never carries Stripe ids or URLs.
 */
export async function cancelPendingPaymentAction(
  projectId: string,
): Promise<CancelPaymentActionResult> {
  let actor;
  try {
    actor = await requireRole("client");
  } catch (e) {
    handleAuthErrorForPage(e);
  }

  const limit = await enforceRateLimit(actor, "payment.cancel");
  if (!limit.ok) return { ok: false, code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE };

  const parsed = startCheckoutInputSchema.safeParse({ projectId });
  if (!parsed.success) return { ok: false, code: "NOT_FOUND", message: NOT_FOUND_MESSAGE };

  let result: CancelPaymentResult;
  try {
    result = await cancelPendingPayment(actor, parsed.data.projectId);
  } catch (e) {
    return toResult(e);
  }

  revalidatePath(`/projects/${parsed.data.projectId}/payment`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/projects");
  return { ok: true, outcome: result.outcome };
}
