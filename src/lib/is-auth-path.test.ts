// @vitest-environment node

import { describe, expect, it } from "vitest";
import { isAuthPath } from "@/lib/is-auth-path";

describe("isAuthPath", () => {
  it.each(["/sign-in", "/sign-in/factor-one", "/sign-up", "/sign-up/verify-email-address"])(
    "%s is an auth path",
    (path) => {
      expect(isAuthPath(path)).toBe(true);
    },
  );

  it.each(["/", "/projects", "/sign-input", "/dashboard", "/onboarding"])("%s is not", (path) => {
    expect(isAuthPath(path)).toBe(false);
  });
});
