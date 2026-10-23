// @vitest-environment node

import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import type { ConnectedAccountSnapshot } from "@/modules/payments/types/connected-account.types";
import {
  deriveConnectedAccountStatus,
  toConnectedAccountSnapshot,
} from "./connected-account-status";

const base: ConnectedAccountSnapshot = {
  closed: false,
  transfersStatus: "pending",
  userActionRequired: false,
  pastDue: false,
};

describe("deriveConnectedAccountStatus", () => {
  it.each<[string, Partial<ConnectedAccountSnapshot>, string]>([
    ["closed wins over active", { closed: true, transfersStatus: "active" }, "restricted"],
    ["active wins over user action", { transfersStatus: "active", userActionRequired: true }, "active"],
    ["active wins over past due", { transfersStatus: "active", pastDue: true }, "active"],
    ["rejected", { transfersStatus: "rejected" }, "restricted"],
    ["restricted", { transfersStatus: "restricted" }, "restricted"],
    ["unsupported", { transfersStatus: "unsupported" }, "restricted"],
    ["restricted wins over user action", { transfersStatus: "restricted", userActionRequired: true }, "restricted"],
    ["pending + past due", { pastDue: true }, "restricted"],
    ["past due wins over user action", { pastDue: true, userActionRequired: true }, "restricted"],
    ["pending + user action", { userActionRequired: true }, "not_started"],
    ["absent status + user action", { transfersStatus: undefined, userActionRequired: true }, "not_started"],
    ["pending, only stripe pending", {}, "pending"],
    ["absent status, nothing else", { transfersStatus: undefined }, "pending"],
    ["unknown status", { transfersStatus: "something_new" }, "pending"],
  ])("%s", (_name, patch, expected) => {
    expect(deriveConnectedAccountStatus({ ...base, ...patch })).toBe(expected);
  });
});

describe("toConnectedAccountSnapshot", () => {
  const asAccount = (o: unknown) => o as Stripe.V2.Core.Account;

  it("does not throw on an object without configuration or requirements", () => {
    expect(toConnectedAccountSnapshot(asAccount({}))).toEqual({
      closed: false,
      transfersStatus: undefined,
      userActionRequired: false,
      pastDue: false,
    });
  });

  it("reads transfers status and closed", () => {
    const snap = toConnectedAccountSnapshot(
      asAccount({
        closed: true,
        configuration: {
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "active" } } } },
        },
      }),
    );
    expect(snap.closed).toBe(true);
    expect(snap.transfersStatus).toBe("active");
  });

  it("detects user-awaited entries but not stripe-awaited ones", () => {
    const user = toConnectedAccountSnapshot(
      asAccount({ requirements: { entries: [{ awaiting_action_from: "user" }] } }),
    );
    const stripe = toConnectedAccountSnapshot(
      asAccount({ requirements: { entries: [{ awaiting_action_from: "stripe" }] } }),
    );
    expect(user.userActionRequired).toBe(true);
    expect(stripe.userActionRequired).toBe(false);
  });

  it("detects past_due in an entry or in the summary", () => {
    const entry = toConnectedAccountSnapshot(
      asAccount({ requirements: { entries: [{ minimum_deadline: { status: "past_due" } }] } }),
    );
    const summary = toConnectedAccountSnapshot(
      asAccount({ requirements: { summary: { minimum_deadline: { status: "past_due" } } } }),
    );
    const due = toConnectedAccountSnapshot(
      asAccount({ requirements: { entries: [{ minimum_deadline: { status: "currently_due" } }] } }),
    );
    expect(entry.pastDue).toBe(true);
    expect(summary.pastDue).toBe(true);
    expect(due.pastDue).toBe(false);
  });
});
