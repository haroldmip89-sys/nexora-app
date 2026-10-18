// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createCheckoutForProject: vi.fn(),
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
vi.mock("@/modules/payments/services/payment-checkout.service", () => ({
  createCheckoutForProject: mocks.createCheckoutForProject,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));

import { AuthError } from "@/modules/auth/services/auth-errors";
import {
  PAYMENT_ERROR_MESSAGES,
  PaymentError,
  type PaymentErrorCode,
} from "@/modules/payments/services/payment-errors";
import { startCheckoutAction } from "./payment.actions";

const PROJECT_ID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_secret";
const client = { id: "u-client", role: "client" };
const ERROR_CODES: PaymentErrorCode[] = [
  "PAYMENT_NOT_ALLOWED",
  "PAYMENT_ALREADY_ACTIVE",
  "STRIPE_UNAVAILABLE",
  "STRIPE_NOT_CONFIGURED",
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createCheckoutForProject.mockReset();
  mocks.createCheckoutForProject.mockResolvedValue({
    attemptId: "a-1",
    checkoutUrl: CHECKOUT_URL,
    reused: false,
  });
  mocks.requireRole.mockReset();
  mocks.requireRole.mockResolvedValue(client);
});

describe("startCheckoutAction", () => {
  it("revalidates the paths and redirects to the service URL on success", async () => {
    await expect(startCheckoutAction(PROJECT_ID)).rejects.toThrow(`NEXT_REDIRECT:${CHECKOUT_URL}`);
    expect(mocks.requireRole).toHaveBeenCalledWith("client");
    expect(mocks.createCheckoutForProject).toHaveBeenCalledWith(client, PROJECT_ID);
    expect(mocks.redirect).toHaveBeenCalledWith(CHECKOUT_URL);
    expect(mocks.revalidatePath.mock.calls.map(([p]) => p).sort()).toEqual(
      [`/projects/${PROJECT_ID}/payment`, "/dashboard/projects"].sort(),
    );
  });

  it("lets the redirect error propagate (not swallowed into a result)", async () => {
    const error = await startCheckoutAction(PROJECT_ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(`NEXT_REDIRECT:${CHECKOUT_URL}`);
  });

  it("revalidates before redirecting", async () => {
    await startCheckoutAction(PROJECT_ID).catch(() => undefined);
    const lastRevalidate = Math.max(...mocks.revalidatePath.mock.invocationCallOrder);
    expect(lastRevalidate).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });

  it("never takes the actor from the input: only the projectId reaches the service", async () => {
    const extra = startCheckoutAction as unknown as (...args: unknown[]) => Promise<unknown>;
    await extra(PROJECT_ID, { id: "evil", role: "admin" }).catch(() => undefined);
    const [actor, id, ...rest] = mocks.createCheckoutForProject.mock.calls[0];
    expect(actor).toBe(client);
    expect(id).toBe(PROJECT_ID);
    expect(rest).toEqual([]);
  });

  it.each(["nope", "", "123"])(
    "returns NOT_FOUND for invalid projectId %j without calling the service",
    async (id) => {
      await expect(startCheckoutAction(id)).resolves.toEqual({
        ok: false,
        code: "NOT_FOUND",
        message: "No encontramos el proyecto.",
      });
      expect(mocks.createCheckoutForProject).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it.each(ERROR_CODES)("maps PaymentError %s to its message", async (code) => {
    mocks.createCheckoutForProject.mockRejectedValue(new PaymentError(code));
    await expect(startCheckoutAction(PROJECT_ID)).resolves.toEqual({
      ok: false,
      code,
      message: PAYMENT_ERROR_MESSAGES[code],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("maps AuthError NOT_FOUND inline", async () => {
    mocks.createCheckoutForProject.mockRejectedValue(new AuthError("NOT_FOUND"));
    await expect(startCheckoutAction(PROJECT_ID)).resolves.toEqual({
      ok: false,
      code: "NOT_FOUND",
      message: "No encontramos el proyecto.",
    });
  });

  it("404s on AuthError FORBIDDEN from the service", async () => {
    mocks.createCheckoutForProject.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(startCheckoutAction(PROJECT_ID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a generic message on unexpected errors without leaking details", async () => {
    mocks.createCheckoutForProject.mockRejectedValue(
      new Error("connection to neon failed: sk_test_secret stripe 500"),
    );
    const result = await startCheckoutAction(PROJECT_ID);
    expect(result).toEqual({
      ok: false,
      code: "UNKNOWN",
      message: "No pudimos completar la acción. Inténtalo de nuevo.",
    });
    expect(JSON.stringify(result)).not.toMatch(/neon|sk_test|stripe/i);
  });

  it("never exposes the checkout URL in an error result", async () => {
    mocks.createCheckoutForProject.mockRejectedValue(new PaymentError("STRIPE_UNAVAILABLE"));
    const result = await startCheckoutAction(PROJECT_ID);
    expect(JSON.stringify(result)).not.toContain("stripe.com");
  });

  it("redirects to sign-in without session and skips the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    await expect(startCheckoutAction(PROJECT_ID)).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(mocks.createCheckoutForProject).not.toHaveBeenCalled();
  });

  it("redirects to onboarding when the user row is missing", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("ONBOARDING_REQUIRED"));
    await expect(startCheckoutAction(PROJECT_ID)).rejects.toThrow("NEXT_REDIRECT:/onboarding");
    expect(mocks.createCheckoutForProject).not.toHaveBeenCalled();
  });

  it("404s on wrong role before validating and skips the service", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(startCheckoutAction("bad")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.createCheckoutForProject).not.toHaveBeenCalled();
  });
});
