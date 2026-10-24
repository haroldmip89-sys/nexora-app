// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { PaymentAttemptStatus } from "@/modules/payments/types/payment.types";
import type { DashboardActionKind, DashboardProjectPayment } from "../types/dashboard.types";
import { deriveProjectActions } from "./dashboard-actions";

function item(
  status: DashboardProjectPayment["status"],
  attempt: PaymentAttemptStatus | null,
  developerPayoutsReady: boolean,
  rated: boolean,
): DashboardProjectPayment {
  return {
    projectId: "p1",
    title: "Landing",
    status,
    developerId: "d1",
    developerName: "Dana",
    amountCents: 1000,
    payment: attempt ? { status: attempt, updatedAt: new Date() } : null,
    transfer: null,
    developerPayoutsReady,
    rated,
  };
}

const attempts: (PaymentAttemptStatus | null)[] = [null, "pending", "failed", "canceled", "completed_test"];

function expected(
  status: DashboardProjectPayment["status"],
  attempt: PaymentAttemptStatus | null,
  ready: boolean,
  rated: boolean,
): DashboardActionKind | null {
  if (status === "contracted") return rated ? null : "rate";
  if (attempt === "pending") return "resume_payment";
  if ((attempt === null || attempt === "failed" || attempt === "canceled") && ready) return "start_payment";
  return null;
}

describe("deriveProjectActions", () => {
  const cases = (["proposal_selected", "contracted"] as const).flatMap((status) =>
    attempts.flatMap((attempt) =>
      [true, false].flatMap((ready) => [true, false].map((rated) => ({ status, attempt, ready, rated }))),
    ),
  );

  it.each(cases)(
    "$status / attempt $attempt / payouts ready $ready / rated $rated",
    ({ status, attempt, ready, rated }) => {
      const actions = deriveProjectActions(item(status, attempt, ready, rated));
      const kind = expected(status, attempt, ready, rated);
      expect(actions.map((a) => a.kind)).toEqual(kind ? [kind] : []);
      for (const a of actions) {
        expect(a).toEqual({ kind, projectId: "p1", projectTitle: "Landing" });
        expect(Object.keys(a).sort()).toEqual(["kind", "projectId", "projectTitle"]);
      }
    },
  );

  it("never derives choose_proposal", () => {
    for (const c of cases) {
      expect(deriveProjectActions(item(c.status, c.attempt, c.ready, c.rated)).map((a) => a.kind)).not.toContain(
        "choose_proposal",
      );
    }
  });
});
