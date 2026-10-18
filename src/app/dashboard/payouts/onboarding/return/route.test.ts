// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  syncConnectedAccount: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  unstable_rethrow: vi.fn(),
}));

vi.mock("@/modules/auth/services/current-user.service", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/modules/payments/services/connected-account.service", () => ({
  syncConnectedAccount: mocks.syncConnectedAccount,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  unstable_rethrow: mocks.unstable_rethrow,
}));

import { AuthError } from "@/modules/auth/services/auth-errors";
import {
  ConnectedAccountError,
  type ConnectedAccountErrorCode,
} from "@/modules/payments/services/connected-account-errors";
import { GET, runtime } from "./route";

const developer = { id: "u-dev", role: "developer" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockReset().mockResolvedValue(developer);
  mocks.syncConnectedAccount.mockReset().mockResolvedValue({ status: "active" });
});

describe("GET /dashboard/payouts/onboarding/return", () => {
  it("runs on the nodejs runtime", () => {
    expect(runtime).toBe("nodejs");
  });

  it("syncs the developer's account and redirects with returned", async () => {
    await expect(GET()).rejects.toThrow("NEXT_REDIRECT:/dashboard/payouts?onboarding=returned");
    expect(mocks.requireRole).toHaveBeenCalledWith("developer");
    expect(mocks.syncConnectedAccount).toHaveBeenCalledWith(developer);
  });

  it.each<ConnectedAccountErrorCode>([
    "STRIPE_NOT_CONFIGURED",
    "STRIPE_UNAVAILABLE",
    "ACCOUNT_UNAVAILABLE",
  ])("redirects with sync_failed on ConnectedAccountError %s", async (code) => {
    mocks.syncConnectedAccount.mockRejectedValue(new ConnectedAccountError(code));
    await expect(GET()).rejects.toThrow("NEXT_REDIRECT:/dashboard/payouts?onboarding=sync_failed");
  });

  it.each([
    ["UNAUTHENTICATED", "NEXT_REDIRECT:/sign-in"],
    ["ONBOARDING_REQUIRED", "NEXT_REDIRECT:/onboarding"],
    ["FORBIDDEN", "NEXT_NOT_FOUND"],
  ] as const)("AuthError %s from requireRole skips the service", async (code, expected) => {
    mocks.requireRole.mockRejectedValue(new AuthError(code));
    await expect(GET()).rejects.toThrow(expected);
    expect(mocks.syncConnectedAccount).not.toHaveBeenCalled();
  });

  it("propagates unexpected errors", async () => {
    const boom = new Error("boom");
    mocks.syncConnectedAccount.mockRejectedValue(boom);
    await expect(GET()).rejects.toBe(boom);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("rethrows Next internal errors via unstable_rethrow", async () => {
    const internal = new Error("NEXT_INTERNAL");
    mocks.requireRole.mockRejectedValue(internal);
    mocks.unstable_rethrow.mockImplementationOnce((e) => {
      throw e;
    });
    await expect(GET()).rejects.toBe(internal);
  });
});
