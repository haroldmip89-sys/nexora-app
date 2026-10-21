import { redirect, unstable_rethrow } from "next/navigation";
import { AuthError, handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { ConnectedAccountError } from "@/modules/payments/services/connected-account-errors";
import { syncConnectedAccount } from "@/modules/payments/services/connected-account.service";
import { retryDeveloperTransfers } from "@/modules/payments/services/developer-transfer.service";

export const runtime = "nodejs";

/** Stripe sends the developer back here after the hosted onboarding (spec 011a RF8). */
export async function GET(): Promise<never> {
  let target = "/dashboard/payouts?onboarding=returned";
  try {
    const actor = await requireRole("developer");
    const { status } = await syncConnectedAccount(actor);
    if (status === "active") {
      try {
        await retryDeveloperTransfers(actor);
      } catch {
        // Auto-retry is best effort (spec 011b D-F): never changes the redirect.
      }
    }
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AuthError) handleAuthErrorForPage(e);
    if (!(e instanceof ConnectedAccountError)) throw e;
    target = "/dashboard/payouts?onboarding=sync_failed";
  }
  redirect(target);
}
