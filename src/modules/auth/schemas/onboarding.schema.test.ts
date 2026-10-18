import { describe, expect, it } from "vitest";
import { onboardingSchema } from "@/modules/auth/schemas/onboarding.schema";

describe("onboardingSchema", () => {
  it.each(["client", "developer"])("accepts %s", (role) => {
    expect(onboardingSchema.safeParse({ role }).success).toBe(true);
  });

  it.each(["admin", "", "Client", "DEVELOPER", 1, null, undefined, {}])(
    "rejects %j",
    (role) => {
      expect(onboardingSchema.safeParse({ role }).success).toBe(false);
    },
  );

  it("rejects a missing body", () => {
    expect(onboardingSchema.safeParse(undefined).success).toBe(false);
  });
});
