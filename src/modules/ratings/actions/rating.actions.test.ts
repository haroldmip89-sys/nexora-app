// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createDeveloperRating: vi.fn(),
  updateDeveloperRating: vi.fn(),
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
vi.mock("@/modules/ratings/services/rating.service", () => ({
  createDeveloperRating: mocks.createDeveloperRating,
  updateDeveloperRating: mocks.updateDeveloperRating,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  unstable_rethrow: mocks.unstable_rethrow,
}));

import { AuthError } from "@/modules/auth/services/auth-errors";
import { RATING_ERROR_MESSAGES, RatingError } from "@/modules/ratings/services/rating-errors";
import {
  createDeveloperRatingAction,
  updateDeveloperRatingAction,
} from "./rating.actions";

const PROJECT_ID = "6f1f3c52-3a52-4b8c-9a2e-0d1b6f7a9c11";
const client = { id: "u-client", role: "client" };
const idle = { status: "idle" } as const;

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockReset().mockResolvedValue(client);
  mocks.createDeveloperRating.mockReset().mockResolvedValue({ developerId: "u-dev" });
  mocks.updateDeveloperRating.mockReset().mockResolvedValue({ developerId: "u-dev" });
});

describe.each([
  ["create", createDeveloperRatingAction, mocks.createDeveloperRating],
  ["update", updateDeveloperRatingAction, mocks.updateDeveloperRating],
] as const)("%s rating action", (_name, action, service) => {
  it("requires the client role before calling the service", async () => {
    await action(PROJECT_ID, idle, form({ rating: "5", comment: "ok" }));
    expect(mocks.requireRole).toHaveBeenCalledWith("client");
    expect(mocks.requireRole.mock.invocationCallOrder[0]).toBeLessThan(
      service.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["UNAUTHENTICATED", "NEXT_REDIRECT:/sign-in"],
    ["ONBOARDING_REQUIRED", "NEXT_REDIRECT:/onboarding"],
    ["FORBIDDEN", "NEXT_NOT_FOUND"],
  ] as const)("AuthError %s skips the service", async (code, expected) => {
    mocks.requireRole.mockRejectedValue(new AuthError(code));
    await expect(action(PROJECT_ID, idle, form({ rating: "5" }))).rejects.toThrow(expected);
    expect(service).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rethrows what unstable_rethrow rethrows around auth", async () => {
    const boom = new Error("NEXT_INTERNAL");
    mocks.requireRole.mockRejectedValue(boom);
    mocks.unstable_rethrow.mockImplementationOnce((e) => {
      throw e;
    });
    await expect(action(PROJECT_ID, idle, form({ rating: "5" }))).rejects.toBe(boom);
    expect(service).not.toHaveBeenCalled();
  });

  it("returns fieldErrors and values for invalid input without calling the service", async () => {
    const result = await action(PROJECT_ID, idle, form({ rating: "0", comment: "x".repeat(601) }));
    expect(result).toMatchObject({
      status: "error",
      values: { rating: "0", comment: "x".repeat(601) },
    });
    if (result.status === "error") {
      expect(result.fieldErrors.rating).toBeTruthy();
      expect(result.fieldErrors.comment).toBeTruthy();
    }
    expect(service).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("treats a missing comment as empty and a missing rating as invalid", async () => {
    await action(PROJECT_ID, idle, form({ rating: "4" }));
    expect(service).toHaveBeenCalledWith(client, PROJECT_ID, { rating: 4, comment: null });

    service.mockClear();
    const result = await action(PROJECT_ID, idle, form({}));
    expect(result).toMatchObject({ status: "error", fieldErrors: { rating: expect.any(String) } });
    expect(service).not.toHaveBeenCalled();
  });

  it("rejects a malformed project id without calling the service", async () => {
    const result = await action("nope", idle, form({ rating: "5" }));
    expect(result).toMatchObject({ status: "error", message: "No encontramos el proyecto." });
    expect(service).not.toHaveBeenCalled();
  });

  it.each(Object.keys(RATING_ERROR_MESSAGES) as (keyof typeof RATING_ERROR_MESSAGES)[])(
    "maps RatingError %s to its message",
    async (code) => {
      service.mockRejectedValue(new RatingError(code));
      const result = await action(PROJECT_ID, idle, form({ rating: "5", comment: "hi" }));
      expect(result).toMatchObject({
        status: "error",
        message: RATING_ERROR_MESSAGES[code],
        values: { rating: "5", comment: "hi" },
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("maps AuthError NOT_FOUND to a not-found message and others to handleAuthErrorForPage", async () => {
    service.mockRejectedValueOnce(new AuthError("NOT_FOUND"));
    await expect(action(PROJECT_ID, idle, form({ rating: "5" }))).resolves.toMatchObject({
      status: "error",
      message: "No encontramos el proyecto.",
    });
    service.mockRejectedValueOnce(new AuthError("FORBIDDEN"));
    await expect(action(PROJECT_ID, idle, form({ rating: "5" }))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns a generic message for unknown errors without leaking or logging the comment", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    service.mockRejectedValue(new Error("neon down"));
    const result = await action(PROJECT_ID, idle, form({ rating: "5", comment: "private text" }));
    expect(result).toMatchObject({
      status: "error",
      message: "No pudimos completar la acción. Inténtalo de nuevo.",
    });
    expect(JSON.stringify(result.status === "error" ? result.message : "")).not.toMatch(/neon/);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/private text/);
    spy.mockRestore();
  });

  it("revalidates the rate page, the developer profile, the account and the client panel, then succeeds", async () => {
    const result = await action(PROJECT_ID, idle, form({ rating: "5", comment: "  great  " }));
    expect(result).toEqual({ status: "success" });
    expect(service).toHaveBeenCalledWith(client, PROJECT_ID, { rating: 5, comment: "great" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/rate`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/developers/u-dev");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/account");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});
