"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { startCheckoutInputSchema } from "@/modules/payments/schemas/payment.schema";
import { createCheckoutForProject } from "@/modules/payments/services/payment-checkout.service";
import {
  PAYMENT_ERROR_MESSAGES,
  PaymentError,
} from "@/modules/payments/services/payment-errors";
import { RATE_LIMITED_MESSAGE, enforceRateLimit } from "@/modules/security/services/rate-limit.service";
import type { CheckoutStartResult, PaymentActionResult } from "@/modules/payments/types/payment.types";

const NOT_FOUND_MESSAGE = "No encontramos el proyecto.";
const GENERIC_MESSAGE = "No pudimos completar la acción. Inténtalo de nuevo.";

function toResult(error: unknown): PaymentActionResult {
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
 * Starts (or resumes) the Stripe Test Mode checkout. Only returns on error; on
 * success it redirects to Stripe, so the Checkout URL never reaches the client as data.
 */
export async function startCheckoutAction(projectId: string): Promise<PaymentActionResult> {
  let actor;
  try {
    actor = await requireRole("client");
  } catch (e) {
    handleAuthErrorForPage(e);
  }

  const limit = await enforceRateLimit(actor, "checkout.start");
  if (!limit.ok) return { ok: false, code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE };

  const parsed = startCheckoutInputSchema.safeParse({ projectId });
  if (!parsed.success) return { ok: false, code: "NOT_FOUND", message: NOT_FOUND_MESSAGE };

  let result: CheckoutStartResult;
  try {
    result = await createCheckoutForProject(actor, parsed.data.projectId);
  } catch (e) {
    return toResult(e);
  }

  revalidatePath(`/projects/${parsed.data.projectId}/payment`);
  revalidatePath("/dashboard/projects");
  // redirect() throws by design: it must stay outside any try/catch.
  redirect(result.checkoutUrl);
}
