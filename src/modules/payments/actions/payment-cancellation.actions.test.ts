// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  enforceRateLimit: vi.fn(),
  cancelPendingPayment: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/modules/auth/services/current-user.service", () => ({
  requireRole: mocks.requireRole,
}));
vi.mock("@/modules/payments/services/payment-cancellation.service", () => ({
  cancelPendingPayment: mocks.cancelPendingPayment,
}));
vi.mock("@/modules/security/services/rate-limit.service", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  RATE_LIMITED_MESSAGE: "rate limited test message",
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));

import { AuthError } from "@/modules/auth/services/auth-errors";
import {
  PAYMENT_ERROR_MESSAGES,
  PaymentError,
  type PaymentErrorCode,
} from "@/modules/payments/services/payment-errors";
import { cancelPendingPaymentAction } from "./payment-cancellation.actions";

const PROJECT_ID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
const client = { id: "u-client", role: "client" };
const ERROR_CODES: PaymentErrorCode[] = [
  "PAYMENT_NOT_ALLOWED",
  "PAYMENT_ALREADY_ACTIVE",
  "STRIPE_UNAVAILABLE",
  "STRIPE_NOT_CONFIGURED",
  "PAYMENT_NOT_CANCELABLE",
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enforceRateLimit.mockReset().mockResolvedValue({ ok: true });
  mocks.cancelPendingPayment.mockReset();
  mocks.cancelPendingPayment.mockResolvedValue({ outcome: "canceled" });
  mocks.requireRole.mockReset();
  mocks.requireRole.mockResolvedValue(client);
});

describe("cancelPendingPaymentAction", () => {
  it("returns the outcome and revalidates the three paths on success", async () => {
    await expect(cancelPendingPaymentAction(PROJECT_ID)).resolves.toEqual({ ok: true, outcome: "canceled" });
    expect(mocks.requireRole).toHaveBeenCalledWith("client");
    expect(mocks.cancelPendingPayment).toHaveBeenCalledWith(client, PROJECT_ID);
    expect(mocks.revalidatePath.mock.calls.map(([p]) => p).sort()).toEqual(
      [`/projects/${PROJECT_ID}/payment`, "/dashboard", "/dashboard/projects"].sort(),
    );
  });

  it.each(["completed", "canceled", "none"])("passes through outcome %s", async (outcome) => {
    mocks.cancelPendingPayment.mockResolvedValue({ outcome });
    await expect(cancelPendingPaymentAction(PROJECT_ID)).resolves.toEqual({ ok: true, outcome });
  });

  it("only passes the projectId to the service (actor never from input)", async () => {
    const extra = cancelPendingPaymentAction as unknown as (...args: unknown[]) => Promise<unknown>;
    await extra(PROJECT_ID, { id: "evil", role: "admin" });
    const [actor, id, ...rest] = mocks.cancelPendingPayment.mock.calls[0];
    expect(actor).toBe(client);
    expect(id).toBe(PROJECT_ID);
    expect(rest).toEqual([]);
  });

  it.each(["nope", "", "123"])("returns NOT_FOUND for invalid projectId %j without calling the service", async (id) => {
    await expect(cancelPendingPaymentAction(id)).resolves.toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "No encontramos el proyecto.",
    });
    expect(mocks.cancelPendingPayment).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(ERROR_CODES)("maps PaymentError %s to its message", async (code) => {
    mocks.cancelPendingPayment.mockRejectedValue(new PaymentError(code));
    await expect(cancelPendingPaymentAction(PROJECT_ID)).resolves.toEqual({
      ok: false,
      code,
      message: PAYMENT_ERROR_MESSAGES[code],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps AuthError NOT_FOUND inline", async () => {
    mocks.cancelPendingPayment.mockRejectedValue(new AuthError("NOT_FOUND"));
    await expect(cancelPendingPaymentAction(PROJECT_ID)).resolves.toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "No encontramos el proyecto.",
    });
  });

  it("404s on AuthError FORBIDDEN from the service", async () => {
    mocks.cancelPendingPayment.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(cancelPendingPaymentAction(PROJECT_ID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a generic message on unexpected errors without leaking details", async () => {
    mocks.cancelPendingPayment.mockRejectedValue(new Error("connection to neon failed: sk_test_secret"));
    const result = await cancelPendingPaymentAction(PROJECT_ID);
    expect(result).toEqual({
      ok: false,
      code: "UNKNOWN",
      message: "No pudimos completar la acción. Inténtalo de nuevo.",
    });
    expect(JSON.stringify(result)).not.toMatch(/neon|sk_test/i);
  });

  it("never returns Stripe ids or URLs on success", async () => {
    const result = await cancelPendingPaymentAction(PROJECT_ID);
    expect(JSON.stringify(result)).not.toMatch(/cs_|pi_|stripe\.com/);
  });

  it("redirects to sign-in without session and skips the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    await expect(cancelPendingPaymentAction(PROJECT_ID)).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(mocks.cancelPendingPayment).not.toHaveBeenCalled();
  });

  it("redirects to onboarding when the user row is missing", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("ONBOARDING_REQUIRED"));
    await expect(cancelPendingPaymentAction(PROJECT_ID)).rejects.toThrow("NEXT_REDIRECT:/onboarding");
    expect(mocks.cancelPendingPayment).not.toHaveBeenCalled();
  });

  it("404s on wrong role before validating and skips the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(cancelPendingPaymentAction("bad")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.cancelPendingPayment).not.toHaveBeenCalled();
  });
});

describe("cancelPendingPaymentAction rate limit", () => {
  it("checks the payment.cancel policy after requireRole", async () => {
    await cancelPendingPaymentAction(PROJECT_ID).catch(() => undefined);
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ role: "client" }), "payment.cancel");
    expect(mocks.requireRole.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enforceRateLimit.mock.invocationCallOrder[0],
    );
  });

  it("returns RATE_LIMITED without calling the service when blocked", async () => {
    mocks.enforceRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 30 });
    await expect(cancelPendingPaymentAction(PROJECT_ID)).resolves.toEqual({
      ok: false,
      code: "RATE_LIMITED",
      message: "rate limited test message",
    });
    expect(mocks.cancelPendingPayment).not.toHaveBeenCalled();
  });

  it("does not consume quota when the role check fails", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await cancelPendingPaymentAction(PROJECT_ID).catch(() => undefined);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  });
});
