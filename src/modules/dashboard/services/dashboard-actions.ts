import type { DashboardAction, DashboardProjectPayment } from "../types/dashboard.types";

/**
 * Pending actions of a project in contracting (proposal_selected | contracted), spec 012 D-L.
 * `choose_proposal` is not derived here: the service builds it with its own query.
 */
export function deriveProjectActions(item: DashboardProjectPayment): DashboardAction[] {
  const action = (kind: DashboardAction["kind"]): DashboardAction[] => [
    { kind, projectId: item.projectId, projectTitle: item.title },
  ];

  switch (item.status) {
    case "proposal_selected": {
      const attempt = item.payment?.status ?? null;
      if (attempt === "pending") return action("resume_payment");
      const canPay = attempt === null || attempt === "canceled" || attempt === "failed";
      return canPay && item.developerPayoutsReady ? action("start_payment") : [];
    }
    case "contracted":
      return item.rated ? [] : action("rate");
  }
}
