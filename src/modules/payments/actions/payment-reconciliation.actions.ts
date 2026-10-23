"use server";

import { revalidatePath } from "next/cache";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { startCheckoutInputSchema } from "@/modules/payments/schemas/payment.schema";
import {
  PAYMENT_ERROR_MESSAGES,
  PaymentError,
} from "@/modules/payments/services/payment-errors";
import { reconcileProjectPayment } from "@/modules/payments/services/payment-reconciliation.service";
import { RATE_LIMITED_MESSAGE, enforceRateLimit } from "@/modules/security/services/rate-limit.service";
import type { ReconcileResult, RefreshActionResult } from "@/modules/payments/types/payment.types";

const NOT_FOUND_MESSAGE = "No encontramos el proyecto.";
const GENERIC_MESSAGE = "No pudimos completar la acción. Inténtalo de nuevo.";

function toResult(error: unknown): RefreshActionResult {
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
 * Re-reads the pending payment's Checkout Session from Stripe and applies the outcome (spec 010 RF7).
 * The browser contributes no state; the result never carries Stripe ids or URLs.
 */
export async function refreshPaymentStatusAction(projectId: string): Promise<RefreshActionResult> {
  let actor;
  try {
    actor = await requireRole("client");
  } catch (e) {
    handleAuthErrorForPage(e);
  }

  const limit = await enforceRateLimit(actor, "payment.refresh");
  if (!limit.ok) return { ok: false, code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE };

  const parsed = startCheckoutInputSchema.safeParse({ projectId });
  if (!parsed.success) return { ok: false, code: "NOT_FOUND", message: NOT_FOUND_MESSAGE };

  let result: ReconcileResult;
  try {
    result = await reconcileProjectPayment(actor, parsed.data.projectId);
  } catch (e) {
    return toResult(e);
  }

  revalidatePath(`/projects/${parsed.data.projectId}/payment`);
  revalidatePath("/dashboard/projects");
  return { ok: true, outcome: result.outcome };
}
