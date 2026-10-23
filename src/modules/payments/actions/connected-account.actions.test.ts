// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  enforceRateLimit: vi.fn(),
  startOnboarding: vi.fn(),
  syncConnectedAccount: vi.fn(),
  retryDeveloperTransfers: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  unstable_rethrow: vi.fn(),
}));

vi.mock("@/modules/auth/services/current-user.service", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("@/modules/payments/services/connected-account.service", () => ({
  startOnboarding: mocks.startOnboarding,
  syncConnectedAccount: mocks.syncConnectedAccount,
}));
vi.mock("@/modules/payments/services/developer-transfer.service", () => ({
  retryDeveloperTransfers: mocks.retryDeveloperTransfers,
}));
vi.mock("@/modules/security/services/rate-limit.service", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  RATE_LIMITED_MESSAGE: "rate limited test message",
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  unstable_rethrow: mocks.unstable_rethrow,
}));

import { AuthError } from "@/modules/auth/services/auth-errors";
import {
  CONNECTED_ACCOUNT_ERROR_MESSAGES,
  ConnectedAccountError,
  type ConnectedAccountErrorCode,
} from "@/modules/payments/services/connected-account-errors";
import {
  refreshConnectedAccountAction,
  startPayoutOnboardingAction,
} from "./connected-account.actions";

const developer = { id: "u-dev", role: "developer" };
const ONBOARDING_URL = "https://connect.stripe.com/setup/e/fake_link";
const ERROR_CODES: ConnectedAccountErrorCode[] = [
  "STRIPE_NOT_CONFIGURED",
  "STRIPE_UNAVAILABLE",
  "ACCOUNT_ALREADY_ACTIVE",
  "ACCOUNT_UNAVAILABLE",
];
const GENERIC = "No pudimos completar la acción. Inténtalo de nuevo.";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enforceRateLimit.mockReset().mockResolvedValue({ ok: true });
  mocks.requireRole.mockReset().mockResolvedValue(developer);
  mocks.startOnboarding.mockReset().mockResolvedValue({ onboardingUrl: ONBOARDING_URL });
  mocks.syncConnectedAccount.mockReset().mockResolvedValue({ status: "active" });
  mocks.retryDeveloperTransfers.mockReset().mockResolvedValue({ attempted: 0, completed: 0, pending: 0, failed: 0 });
});

describe.each([
  ["startPayoutOnboardingAction", startPayoutOnboardingAction, mocks.startOnboarding],
  ["refreshConnectedAccountAction", refreshConnectedAccountAction, mocks.syncConnectedAccount],
] as const)("%s guards and errors", (_name, action, service) => {
  it("requires the developer role before calling the service", async () => {
    await action().catch(() => undefined);
    expect(mocks.requireRole).toHaveBeenCalledWith("developer");
    expect(mocks.requireRole.mock.invocationCallOrder[0]).toBeLessThan(
      service.mock.invocationCallOrder[0],
    );
    expect(service).toHaveBeenCalledWith(developer);
  });

  it.each([
    ["UNAUTHENTICATED", "NEXT_REDIRECT:/sign-in"],
    ["ONBOARDING_REQUIRED", "NEXT_REDIRECT:/onboarding"],
    ["FORBIDDEN", "NEXT_NOT_FOUND"],
  ] as const)("AuthError %s from requireRole skips the service", async (code, expected) => {
    mocks.requireRole.mockRejectedValue(new AuthError(code));
    await expect(action()).rejects.toThrow(expected);
    expect(service).not.toHaveBeenCalled();
  });

  it("calls unstable_rethrow around auth and rethrows what it rethrows", async () => {
    const boom = new Error("NEXT_INTERNAL");
    mocks.requireRole.mockRejectedValue(boom);
    mocks.unstable_rethrow.mockImplementationOnce((e) => {
      throw e;
    });
    await expect(action()).rejects.toBe(boom);
    expect(service).not.toHaveBeenCalled();
  });

  it.each(ERROR_CODES)("maps ConnectedAccountError %s to its message", async (code) => {
    service.mockRejectedValue(new ConnectedAccountError(code));
    await expect(action()).resolves.toEqual({
      ok: false,
      code,
      message: CONNECTED_ACCOUNT_ERROR_MESSAGES[code],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("404s on AuthError FORBIDDEN from the service", async () => {
    service.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(action()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns a generic message on unexpected errors without leaking details", async () => {
    service.mockRejectedValue(new Error("neon down acct_123 sk_test_secret"));
    const result = await action();
    expect(result).toEqual({ ok: false, code: "UNKNOWN", message: GENERIC });
    expect(JSON.stringify(result)).not.toMatch(/neon|acct_|sk_test/i);
  });
});

describe("startPayoutOnboardingAction", () => {
  it("revalidates then redirects to the onboarding URL", async () => {
    await expect(startPayoutOnboardingAction()).rejects.toThrow(`NEXT_REDIRECT:${ONBOARDING_URL}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/payouts");
    expect(mocks.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0],
    );
  });

  it("does not swallow the redirect as an UNKNOWN error", async () => {
    await expect(startPayoutOnboardingAction()).rejects.toThrow(/^NEXT_REDIRECT:/);
  });
});

describe("refreshConnectedAccountAction", () => {
  it.each(["not_started", "pending", "active", "restricted"])(
    "returns ok with status %s and revalidates",
    async (status) => {
      mocks.syncConnectedAccount.mockResolvedValue({ status });
      await expect(refreshConnectedAccountAction()).resolves.toEqual({ ok: true, status });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/payouts");
    },
  );

  it("retries only pending transfers when the status is active", async () => {
    await refreshConnectedAccountAction();
    expect(mocks.retryDeveloperTransfers).toHaveBeenCalledTimes(1);
    expect(mocks.retryDeveloperTransfers).toHaveBeenCalledWith(developer);
  });

  it.each(["not_started", "pending", "restricted"])("does not retry when the status is %s", async (status) => {
    mocks.syncConnectedAccount.mockResolvedValue({ status });
    await refreshConnectedAccountAction();
    expect(mocks.retryDeveloperTransfers).not.toHaveBeenCalled();
  });

  it("a failing retry does not change the result", async () => {
    mocks.retryDeveloperTransfers.mockRejectedValue(new Error("boom"));
    await expect(refreshConnectedAccountAction()).resolves.toEqual({ ok: true, status: "active" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/payouts");
  });

  it("never returns Stripe ids or URLs", async () => {
    const result = await refreshConnectedAccountAction();
    expect(JSON.stringify(result)).not.toMatch(/acct_|stripe\.com/);
  });
});

describe("startPayoutOnboardingAction rate limit", () => {
  it("checks the payout.onboarding policy after requireRole", async () => {
    await startPayoutOnboardingAction().catch(() => undefined);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ role: "developer" }), "payout.onboarding");
    expect(mocks.requireRole.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enforceRateLimit.mock.invocationCallOrder[0],
    );
  });

  it("returns RATE_LIMITED without calling the service when blocked", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 30 });
    await expect(startPayoutOnboardingAction()).resolves.toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "rate limited test message",
    });
    expect(mocks.startOnboarding).not.toHaveBeenCalled();
  });

  it("does not consume quota when the role check fails", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await startPayoutOnboardingAction().catch(() => undefined);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });
});

describe("refreshConnectedAccountAction rate limit", () => {
  it("checks the payout.refresh policy after requireRole", async () => {
    await refreshConnectedAccountAction().catch(() => undefined);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ role: "developer" }), "payout.refresh");
    expect(mocks.requireRole.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enforceRateLimit.mock.invocationCallOrder[0],
    );
  });

  it("returns RATE_LIMITED without calling the service when blocked", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 30 });
    await expect(refreshConnectedAccountAction()).resolves.toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "rate limited test message",
    });
    expect(mocks.syncConnectedAccount).not.toHaveBeenCalled();
  });

  it("does not consume quota when the role check fails", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await refreshConnectedAccountAction().catch(() => undefined);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });
});
