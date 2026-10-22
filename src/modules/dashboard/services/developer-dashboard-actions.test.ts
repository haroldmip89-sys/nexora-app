import { describe, expect, it } from "vitest";
import type { ConnectedAccountOverview } from "@/modules/payments/types/connected-account.types";
import type { DeveloperTransferStatus } from "@/modules/payments/types/developer-transfer.types";
import type { PaymentAttemptStatus } from "@/modules/payments/types/payment.types";
import { DASHBOARD_LIST_LIMIT } from "../types/dashboard.types";
import type { DeveloperWonProject } from "../types/developer-dashboard.types";
import { deriveDeveloperActions } from "./developer-dashboard-actions";

const accountStatuses: ConnectedAccountOverview["status"][] = ["not_started", "pending", "restricted", "active"];
const projectStatuses: DeveloperWonProject["status"][] = ["proposal_selected", "contracted"];
const attempts: (PaymentAttemptStatus | null)[] = [null, "pending", "failed", "canceled", "completed_test"];
const transfers: (DeveloperTransferStatus | null)[] = [null, "pending", "failed", "completed_test"];

function payouts(status: ConnectedAccountOverview["status"]): ConnectedAccountOverview {
  return { status, hasStripeAccount: status !== "not_started", statusSyncedAt: null };
}

function project(
  id: string,
  status: DeveloperWonProject["status"],
  attempt: PaymentAttemptStatus | null,
  transfer: DeveloperTransferStatus | null,
): DeveloperWonProject {
  return {
    projectId: id,
    title: `Title ${id}`,
    status,
    clientName: "Maria G.",
    amountCents: 1000,
    payment: attempt ? { status: attempt, updatedAt: new Date() } : null,
    transfer: transfer
      ? { status: transfer, completedAt: transfer === "completed_test" ? new Date() : null, reason: null }
      : null,
  };
}

describe("deriveDeveloperActions", () => {
  const cases = accountStatuses.flatMap((account) =>
    projectStatuses.flatMap((status) =>
      attempts.flatMap((attempt) => transfers.map((transfer) => ({ account, status, attempt, transfer }))),
    ),
  );

  it.each(cases)(
    "account=$account project=$status attempt=$attempt transfer=$transfer follows the D-H table",
    ({ account, status, attempt, transfer }) => {
      const actions = deriveDeveloperActions({ payouts: payouts(account), won: [project("p1", status, attempt, transfer)] });
      const kinds = actions.map((a) => a.kind);

      expect(kinds.includes("setup_payouts")).toBe(account !== "active");
      expect(kinds.includes("retry_transfer")).toBe(transfer === "pending" || transfer === "failed");
      const unpaid = attempt === null || attempt === "pending" || attempt === "failed" || attempt === "canceled";
      const retry = transfer === "pending" || transfer === "failed";
      expect(kinds.includes("awaiting_payment")).toBe(status === "proposal_selected" && unpaid && !retry);
    },
  );

  it("builds each action with the explicit shape", () => {
    const failed: DeveloperWonProject = {
      ...project("p1", "contracted", "completed_test", "failed"),
      transfer: { status: "failed", completedAt: null, reason: "STRIPE_UNAVAILABLE" },
    };
    const result = deriveDeveloperActions({
      payouts: payouts("restricted"),
      won: [failed, project("p2", "proposal_selected", null, null)],
    });
    expect(result).toEqual([
      { kind: "setup_payouts", payoutsStatus: "restricted", hasStripeAccount: true },
      {
        kind: "retry_transfer",
        projectId: "p1",
        projectTitle: "Title p1",
        transferStatus: "failed",
        reason: "STRIPE_UNAVAILABLE",
      },
      { kind: "awaiting_payment", projectId: "p2", projectTitle: "Title p2", payoutsReady: false },
    ]);
  });

  it("awaiting_payment reports payoutsReady from the account", () => {
    const [action] = deriveDeveloperActions({
      payouts: payouts("active"),
      won: [project("p1", "proposal_selected", "failed", null)],
    });
    expect(action).toMatchObject({ kind: "awaiting_payment", payoutsReady: true });
  });

  it("orders setup_payouts, retry_transfer, awaiting_payment regardless of project order", () => {
    const kinds = deriveDeveloperActions({
      payouts: payouts("pending"),
      won: [
        project("a", "proposal_selected", null, null),
        project("b", "contracted", "completed_test", "pending"),
        project("c", "proposal_selected", "pending", null),
        project("d", "contracted", "completed_test", "failed"),
      ],
    }).map((a) => a.kind);
    expect(kinds).toEqual(["setup_payouts", "retry_transfer", "retry_transfer", "awaiting_payment", "awaiting_payment"]);
  });

  it("no actions for an active account with everything settled", () => {
    expect(
      deriveDeveloperActions({
        payouts: payouts("active"),
        won: [project("a", "contracted", "completed_test", "completed_test"), project("b", "contracted", "completed_test", null)],
      }),
    ).toEqual([]);
  });

  it("caps the result to DASHBOARD_LIST_LIMIT keeping the priority order", () => {
    const won = Array.from({ length: DASHBOARD_LIST_LIMIT + 5 }, (_, i) => project(`p${i}`, "proposal_selected", null, null));
    won.push(project("retry", "contracted", "completed_test", "pending"));
    const result = deriveDeveloperActions({ payouts: payouts("not_started"), won });
    expect(result).toHaveLength(DASHBOARD_LIST_LIMIT);
    expect(result[0].kind).toBe("setup_payouts");
    expect(result[1].kind).toBe("retry_transfer");
  });
});
