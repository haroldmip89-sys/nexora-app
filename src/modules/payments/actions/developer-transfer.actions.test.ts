// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  retryDeveloperTransfers: vi.fn(),
  revalidatePath: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  unstable_rethrow: vi.fn(),
}));

vi.mock("@/modules/auth/services/current-user.service", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/modules/payments/services/developer-transfer.service", () => ({
  retryDeveloperTransfers: mocks.retryDeveloperTransfers,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  unstable_rethrow: mocks.unstable_rethrow,
}));

import { AuthError } from "@/modules/auth/services/auth-errors";
import { retryTransfersAction } from "./developer-transfer.actions";

const developer = { id: "u-dev", role: "developer" };
const counters = { attempted: 2, completed: 1, pending: 1, failed: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockReset().mockResolvedValue(developer);
  mocks.retryDeveloperTransfers.mockReset().mockResolvedValue(counters);
});

describe("retryTransfersAction", () => {
  it("requires the developer role, retries with failed included and revalidates", async () => {
    await expect(retryTransfersAction()).resolves.toEqual({ ok: true, ...counters });
    expect(mocks.requireRole).toHaveBeenCalledWith("developer");
    expect(mocks.retryDeveloperTransfers).toHaveBeenCalledWith(developer, { includeFailed: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/payouts");
  });

  it.each([
    ["UNAUTHENTICATED", "NEXT_REDIRECT:/sign-in"],
    ["ONBOARDING_REQUIRED", "NEXT_REDIRECT:/onboarding"],
    ["FORBIDDEN", "NEXT_NOT_FOUND"],
  ] as const)("AuthError %s from requireRole skips the service", async (code, expected) => {
    mocks.requireRole.mockRejectedValue(new AuthError(code));
    await expect(retryTransfersAction()).rejects.toThrow(expected);
    expect(mocks.retryDeveloperTransfers).not.toHaveBeenCalled();
  });

  it("404s on AuthError FORBIDDEN from the service", async () => {
    mocks.retryDeveloperTransfers.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(retryTransfersAction()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rethrows what unstable_rethrow rethrows", async () => {
    const boom = new Error("NEXT_INTERNAL");
    mocks.retryDeveloperTransfers.mockRejectedValue(boom);
    mocks.unstable_rethrow.mockImplementationOnce((e) => {
      throw e;
    });
    await expect(retryTransfersAction()).rejects.toBe(boom);
  });

  it("returns a generic message on unexpected errors without leaking details", async () => {
    mocks.retryDeveloperTransfers.mockRejectedValue(new Error("neon down acct_123 sk_test_fake"));
    const result = await retryTransfersAction();
    expect(result).toEqual({
      ok: false,
      code: "UNKNOWN",
      message: "No pudimos completar la acción. Inténtalo de nuevo.",
    });
    expect(JSON.stringify(result)).not.toMatch(/neon|acct_|sk_test/i);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
