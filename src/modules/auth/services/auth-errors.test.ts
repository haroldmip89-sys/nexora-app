// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { redirect, notFound } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ redirect, notFound }));

import {
  AuthError,
  authErrorToResponse,
  handleAuthErrorForPage,
} from "@/modules/auth/services/auth-errors";

beforeEach(() => vi.clearAllMocks());

describe("AuthError", () => {
  it.each([
    ["UNAUTHENTICATED", 401],
    ["ONBOARDING_REQUIRED", 403],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
  ] as const)("%s maps to status %i", (code, status) => {
    const e = new AuthError(code);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(code);
    expect(e.status).toBe(status);
  });
});

describe("authErrorToResponse", () => {
  it("returns JSON with code and status", async () => {
    const res = authErrorToResponse(new AuthError("FORBIDDEN"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "FORBIDDEN" });
  });

  it("rethrows unknown errors", () => {
    const boom = new Error("boom");
    expect(() => authErrorToResponse(boom)).toThrow(boom);
  });
});

describe("handleAuthErrorForPage", () => {
  it("redirects UNAUTHENTICATED to /sign-in", () => {
    expect(() => handleAuthErrorForPage(new AuthError("UNAUTHENTICATED"))).toThrow(
      "REDIRECT:/sign-in",
    );
  });

  it("redirects ONBOARDING_REQUIRED to /onboarding", () => {
    expect(() => handleAuthErrorForPage(new AuthError("ONBOARDING_REQUIRED"))).toThrow(
      "REDIRECT:/onboarding",
    );
  });

  it.each(["FORBIDDEN", "NOT_FOUND"] as const)("%s calls notFound", (code) => {
    expect(() => handleAuthErrorForPage(new AuthError(code))).toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("rethrows unknown errors without redirecting", () => {
    const boom = new Error("boom");
    expect(() => handleAuthErrorForPage(boom)).toThrow(boom);
    expect(redirect).not.toHaveBeenCalled();
  });
});
