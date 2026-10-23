// @vitest-environment node

import { describe, expect, it } from "vitest";
import { paymentPageQuerySchema, startCheckoutInputSchema } from "./payment.schema";

describe("startCheckoutInputSchema", () => {
  it("accepts a UUID", () => {
    const projectId = "3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c";
    expect(startCheckoutInputSchema.safeParse({ projectId }).success).toBe(true);
  });

  it.each(["", "abc", 123, null, undefined])("rejects %j", (projectId) => {
    expect(startCheckoutInputSchema.safeParse({ projectId }).success).toBe(false);
  });

  it("ignores extra fields such as amount", () => {
    const parsed = startCheckoutInputSchema.parse({
      projectId: "3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c",
      amountCents: 1,
    });
    expect(Object.keys(parsed)).toEqual(["projectId"]);
  });
});

describe("paymentPageQuerySchema", () => {
  it("keeps success and cancel", () => {
    expect(paymentPageQuerySchema.parse({ checkout: "success" }).checkout).toBe("success");
    expect(paymentPageQuerySchema.parse({ checkout: "cancel" }).checkout).toBe("cancel");
  });

  it.each([{}, { checkout: "paid" }, { checkout: ["success"] }, { checkout: "" }, { checkout: 1 }])(
    "yields undefined for %j",
    (query) => {
      expect(paymentPageQuerySchema.parse(query).checkout).toBeUndefined();
    },
  );
});
