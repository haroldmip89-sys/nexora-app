import type { ConnectedAccountOverview } from "@/modules/payments/types/connected-account.types";
import { DASHBOARD_LIST_LIMIT } from "../types/dashboard.types";
import type { DeveloperAction, DeveloperWonProject } from "../types/developer-dashboard.types";

type RetryTransferAction = Extract<DeveloperAction, { kind: "retry_transfer" }>;
type AwaitingPaymentAction = Extract<DeveloperAction, { kind: "awaiting_payment" }>;

function deriveProjectAction(
  project: DeveloperWonProject,
  payoutsReady: boolean,
): RetryTransferAction | AwaitingPaymentAction | null {
  const transfer = project.transfer;
  if (transfer && (transfer.status === "pending" || transfer.status === "failed")) {
    return {
      kind: "retry_transfer",
      projectId: project.projectId,
      projectTitle: project.title,
      transferStatus: transfer.status,
      reason: transfer.reason,
    };
  }

  switch (project.status) {
    case "proposal_selected": {
      const attempt = project.payment?.status ?? null;
      const unpaid = attempt === null || attempt === "pending" || attempt === "canceled" || attempt === "failed";
      return unpaid
        ? { kind: "awaiting_payment", projectId: project.projectId, projectTitle: project.title, payoutsReady }
        : null;
    }
    case "contracted":
      return null;
  }
}

/**
 * Pending actions of the developer, spec 013 D-H. Order: setup_payouts, retry_transfer,
 * awaiting_payment; capped to DASHBOARD_LIST_LIMIT.
 */
export function deriveDeveloperActions(input: {
  payouts: ConnectedAccountOverview;
  won: DeveloperWonProject[];
}): DeveloperAction[] {
  const { payouts, won } = input;
  const payoutsReady = payouts.status === "active";

  const setup: DeveloperAction[] = payoutsReady
    ? []
    : [{ kind: "setup_payouts", payoutsStatus: payouts.status, hasStripeAccount: payouts.hasStripeAccount }];

  const perProject = won.flatMap((p) => deriveProjectAction(p, payoutsReady) ?? []);
  const retries = perProject.filter((a): a is RetryTransferAction => a.kind === "retry_transfer");
  const awaiting = perProject.filter((a): a is AwaitingPaymentAction => a.kind === "awaiting_payment");

  return [...setup, ...retries, ...awaiting].slice(0, DASHBOARD_LIST_LIMIT);
}
