import type Stripe from "stripe";
import type {
  ConnectedAccountSnapshot,
  ConnectedAccountStatus,
} from "@/modules/payments/types/connected-account.types";

/** Disabled reasons that mean "Stripe is still verifying", not "action required". */
const VERIFYING_DISABLED_REASONS = new Set(["requirements.pending_verification", "under_review"]);

export function toConnectedAccountSnapshot(account: Stripe.Account): ConnectedAccountSnapshot {
  return {
    detailsSubmitted: account.details_submitted === true,
    transfersCapability: account.capabilities?.transfers,
    currentlyDue: account.requirements?.currently_due ?? [],
    pastDue: account.requirements?.past_due ?? [],
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

/** Pure derivation of the cached status from a Stripe snapshot (spec 011a RF1, in precedence order). */
export function deriveConnectedAccountStatus(s: ConnectedAccountSnapshot): ConnectedAccountStatus {
  if (s.transfersCapability === "active") return "active";
  if (!s.detailsSubmitted) return "not_started";
  if (
    s.pastDue.length > 0 ||
    s.currentlyDue.length > 0 ||
    (s.disabledReason !== null && !VERIFYING_DISABLED_REASONS.has(s.disabledReason))
  ) {
    return "restricted";
  }
  return "pending";
}
