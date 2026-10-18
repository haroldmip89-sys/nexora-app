import { redirect, unstable_rethrow } from "next/navigation";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { ConnectedAccountError } from "@/modules/payments/services/connected-account-errors";
import { startOnboarding } from "@/modules/payments/services/connected-account.service";

export const runtime = "nodejs";

/** Stripe sends the developer here when the onboarding link expired or was used (spec 011a RF8). */
export async function GET(): Promise<never> {
  let target: string;
  try {
    const actor = await requireRole("developer");
    ({ onboardingUrl: target } = await startOnboarding(actor));
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AuthError) handleAuthErrorForPage(e);
    if (!(e instanceof ConnectedAccountError)) throw e;
    target =
      e.code === "ACCOUNT_ALREADY_ACTIVE"
        ? "/dashboard/payouts?onboarding=returned"
        : "/dashboard/payouts?onboarding=link_failed";
  }
  redirect(target);
}
