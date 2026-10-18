import { describe, expect, it } from "vitest";
import { payoutsPageQuerySchema } from "./connected-account.schema";

describe("payoutsPageQuerySchema", () => {
  it.each(["returned", "link_failed", "sync_failed"])("keeps %s", (onboarding) => {
    expect(payoutsPageQuerySchema.parse({ onboarding }).onboarding).toBe(onboarding);
  });

  it.each([{}, { onboarding: "active" }, { onboarding: ["returned"] }, { onboarding: "" }, { onboarding: 1 }])(
    "yields undefined for %j",
    (query) => {
      expect(payoutsPageQuerySchema.parse(query).onboarding).toBeUndefined();
    },
  );
});
