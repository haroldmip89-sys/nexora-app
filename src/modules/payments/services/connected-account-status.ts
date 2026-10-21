import type Stripe from "stripe";
import type {
  ConnectedAccountSnapshot,
  ConnectedAccountStatus,
} from "@/modules/payments/types/connected-account.types";

const RESTRICTED_TRANSFER_STATUSES = new Set(["rejected", "restricted", "unsupported"]);

export function toConnectedAccountSnapshot(account: Stripe.V2.Core.Account): ConnectedAccountSnapshot {
  const entries = account.requirements?.entries ?? [];
  return {
    closed: account.closed === true,
    transfersStatus:
      account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status,
    userActionRequired: entries.some((e) => e.awaiting_action_from === "user"),
    pastDue:
      entries.some((e) => e.minimum_deadline?.status === "past_due") ||
      account.requirements?.summary?.minimum_deadline?.status === "past_due",
  };
}

/** Pure derivation of the cached status from a Stripe v2 snapshot (spec 011c §2, in precedence order). */
export function deriveConnectedAccountStatus(s: ConnectedAccountSnapshot): ConnectedAccountStatus {
  if (s.closed) return "restricted";
  if (s.transfersStatus === "active") return "active";
  if (s.transfersStatus && RESTRICTED_TRANSFER_STATUSES.has(s.transfersStatus)) return "restricted";
  if (s.pastDue) return "restricted";
  if (s.userActionRequired) return "not_started";
  return "pending";
}
