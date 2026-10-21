"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { retryDeveloperTransfers } from "@/modules/payments/services/developer-transfer.service";
import type { RetryTransfersActionResult } from "@/modules/payments/types/developer-transfer.types";

const GENERIC_MESSAGE = "No pudimos completar la acción. Inténtalo de nuevo.";

/** Retries the developer's own pending and failed test transfers (spec 011b RF5). Takes no input. */
export async function retryTransfersAction(): Promise<RetryTransfersActionResult> {
  let actor;
  try {
    actor = await requireRole("developer");
  } catch (e) {
    unstable_rethrow(e);
    return handleAuthErrorForPage(e);
  }

  let result;
  try {
    result = await retryDeveloperTransfers(actor, { includeFailed: true });
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AuthError) handleAuthErrorForPage(e);
    return { ok: false, code: "UNKNOWN", message: GENERIC_MESSAGE };
  }

  revalidatePath("/dashboard/payouts");
  return { ok: true, ...result };
}
