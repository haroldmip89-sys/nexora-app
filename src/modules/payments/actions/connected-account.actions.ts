"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import {
  CONNECTED_ACCOUNT_ERROR_MESSAGES,
  ConnectedAccountError,
} from "@/modules/payments/services/connected-account-errors";
import {
  startOnboarding,
  syncConnectedAccount,
} from "@/modules/payments/services/connected-account.service";
import { retryDeveloperTransfers } from "@/modules/payments/services/developer-transfer.service";
import type {
  ConnectedAccountActionResult,
  RefreshConnectedAccountResult,
} from "@/modules/payments/types/connected-account.types";

const GENERIC_MESSAGE = "No pudimos completar la acción. Inténtalo de nuevo.";
const PAYOUTS_PATH = "/dashboard/payouts";

function toResult(error: unknown): ConnectedAccountActionResult {
  if (error instanceof ConnectedAccountError) {
    return { ok: false, code: error.code, message: CONNECTED_ACCOUNT_ERROR_MESSAGES[error.code] };
  }
  unstable_rethrow(error);
  if (error instanceof AuthError) handleAuthErrorForPage(error);
  return { ok: false, code: "UNKNOWN", message: GENERIC_MESSAGE };
}

async function requireDeveloper() {
  try {
    return await requireRole("developer");
  } catch (e) {
    unstable_rethrow(e);
    return handleAuthErrorForPage(e);
  }
}

/**
 * Creates (once) the developer's connected account and redirects to Stripe's hosted onboarding
 * (spec 011a RF7). The onboarding URL is only a redirect target: never returned as data.
 */
export async function startPayoutOnboardingAction(): Promise<ConnectedAccountActionResult> {
  const actor = await requireDeveloper();

  let onboardingUrl: string;
  try {
    ({ onboardingUrl } = await startOnboarding(actor));
  } catch (e) {
    return toResult(e);
  }

  revalidatePath(PAYOUTS_PATH);
  redirect(onboardingUrl);
}

/** Re-reads the connected account from Stripe and stores the derived status (spec 011a RF7). */
export async function refreshConnectedAccountAction(): Promise<RefreshConnectedAccountResult> {
  const actor = await requireDeveloper();

  let status;
  try {
    ({ status } = await syncConnectedAccount(actor));
  } catch (e) {
    return toResult(e);
  }

  if (status === "active") {
    try {
      await retryDeveloperTransfers(actor);
    } catch {
      // Auto-retry is best effort (spec 011b D-F): never changes the sync result.
    }
  }

  revalidatePath(PAYOUTS_PATH);
  return { ok: true, status };
}
