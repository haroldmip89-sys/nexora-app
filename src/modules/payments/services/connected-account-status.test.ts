import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import type { ConnectedAccountSnapshot } from "@/modules/payments/types/connected-account.types";
import {
  deriveConnectedAccountStatus,
  toConnectedAccountSnapshot,
} from "./connected-account-status";

const base: ConnectedAccountSnapshot = {
  detailsSubmitted: true,
  transfersCapability: "pending",
  currentlyDue: [],
  pastDue: [],
  disabledReason: null,
};

describe("deriveConnectedAccountStatus", () => {
  it.each<[string, Partial<ConnectedAccountSnapshot>, string]>([
    ["transfers active wins over currentlyDue", { transfersCapability: "active", currentlyDue: ["x"] }, "active"],
    ["transfers active wins over disabledReason", { transfersCapability: "active", disabledReason: "rejected.fraud" }, "active"],
    ["transfers active without details", { transfersCapability: "active", detailsSubmitted: false }, "active"],
    ["no details + pastDue", { detailsSubmitted: false, pastDue: ["x"] }, "not_started"],
    ["no details, nothing else", { detailsSubmitted: false }, "not_started"],
    ["capabilities absent, no details", { detailsSubmitted: false, transfersCapability: undefined }, "not_started"],
    ["capabilities absent, details submitted", { transfersCapability: undefined }, "pending"],
    ["pastDue", { pastDue: ["external_account"] }, "restricted"],
    ["currentlyDue", { currentlyDue: ["individual.id_number"] }, "restricted"],
    ["rejected.fraud", { disabledReason: "rejected.fraud" }, "restricted"],
    ["action_required", { disabledReason: "action_required.requested_capabilities" }, "restricted"],
    ["platform_paused", { disabledReason: "platform_paused" }, "restricted"],
    ["pending_verification, no requirements", { disabledReason: "requirements.pending_verification" }, "pending"],
    ["under_review, no requirements", { disabledReason: "under_review" }, "pending"],
    ["pending_verification with currentlyDue", { disabledReason: "requirements.pending_verification", currentlyDue: ["x"] }, "restricted"],
    ["inactive capability, no requirements", { transfersCapability: "inactive" }, "pending"],
    ["pending capability, no requirements", {}, "pending"],
  ])("%s", (_name, patch, expected) => {
    expect(deriveConnectedAccountStatus({ ...base, ...patch })).toBe(expected);
  });
});

describe("toConnectedAccountSnapshot", () => {
  it("normalizes null requirements to empty arrays", () => {
    const account = {
      details_submitted: true,
      capabilities: { transfers: "pending" },
      requirements: { currently_due: null, past_due: null, disabled_reason: null },
    } as unknown as Stripe.Account;
    expect(toConnectedAccountSnapshot(account)).toEqual({
      detailsSubmitted: true,
      transfersCapability: "pending",
      currentlyDue: [],
      pastDue: [],
      disabledReason: null,
    });
  });

  it("handles missing capabilities and requirements", () => {
    const snap = toConnectedAccountSnapshot({ details_submitted: false } as unknown as Stripe.Account);
    expect(snap).toEqual({
      detailsSubmitted: false,
      transfersCapability: undefined,
      currentlyDue: [],
      pastDue: [],
      disabledReason: null,
    });
  });

  it("copies requirement lists", () => {
    const snap = toConnectedAccountSnapshot({
      details_submitted: true,
      capabilities: { transfers: "inactive" },
      requirements: { currently_due: ["a"], past_due: ["b"], disabled_reason: "other" },
    } as unknown as Stripe.Account);
    expect(snap.currentlyDue).toEqual(["a"]);
    expect(snap.pastDue).toEqual(["b"]);
    expect(snap.disabledReason).toBe("other");
  });
});
