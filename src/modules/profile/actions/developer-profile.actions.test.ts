// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  saveOwnProfile: vi.fn(),
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
vi.mock("@/modules/profile/services/developer-profile.service", () => ({
  saveOwnProfile: mocks.saveOwnProfile,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  unstable_rethrow: mocks.unstable_rethrow,
}));

import { AuthError } from "@/modules/auth/services/auth-errors";
import { saveDeveloperProfileAction } from "./developer-profile.actions";

const developer = { id: "u-dev", role: "developer" };
const validInput = {
  headline: "  Full-stack developer ",
  location: "",
  availability: "available",
  bio: "Hola",
  links: [{ type: "github", url: "https://github.com/x" }],
  contactEmail: "secret.contact@example.com",
  contactVisibility: "accepted_client",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockReset().mockResolvedValue(developer);
  mocks.saveOwnProfile.mockReset().mockResolvedValue(undefined);
});

describe("saveDeveloperProfileAction", () => {
  it("requires the developer role before validating or saving", async () => {
    await saveDeveloperProfileAction(validInput);
    expect(mocks.requireRole).toHaveBeenCalledWith("developer");
    expect(mocks.requireRole.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveOwnProfile.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["UNAUTHENTICATED", "NEXT_REDIRECT:/sign-in"],
    ["ONBOARDING_REQUIRED", "NEXT_REDIRECT:/onboarding"],
    ["FORBIDDEN", "NEXT_NOT_FOUND"],
  ] as const)("AuthError %s skips the service, even with invalid input", async (code, expected) => {
    mocks.requireRole.mockRejectedValue(new AuthError(code));
    await expect(saveDeveloperProfileAction({ bogus: true })).rejects.toThrow(expected);
    expect(mocks.saveOwnProfile).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("calls unstable_rethrow around auth and rethrows what it rethrows", async () => {
    const boom = new Error("NEXT_INTERNAL");
    mocks.requireRole.mockRejectedValue(boom);
    mocks.unstable_rethrow.mockImplementationOnce((e) => {
      throw e;
    });
    await expect(saveDeveloperProfileAction(validInput)).rejects.toBe(boom);
    expect(mocks.saveOwnProfile).not.toHaveBeenCalled();
  });

  it("returns VALIDATION with fieldErrors and does not call the service", async () => {
    const result = await saveDeveloperProfileAction({ ...validInput, headline: "", bio: "x".repeat(1001) });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    if (result.ok === false && result.code === "VALIDATION") {
      expect(result.fieldErrors.headline).toBeTruthy();
      expect(result.fieldErrors.bio).toBeTruthy();
    }
    expect(mocks.saveOwnProfile).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects extra keys such as userId or role", async () => {
    const result = await saveDeveloperProfileAction({ ...validInput, userId: "u-other" });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.saveOwnProfile).not.toHaveBeenCalled();
  });

  it("saves parsed data for the session actor, revalidates and returns ok", async () => {
    await expect(saveDeveloperProfileAction(validInput)).resolves.toEqual({ ok: true });
    expect(mocks.saveOwnProfile).toHaveBeenCalledWith(developer, {
      ...validInput,
      headline: "Full-stack developer",
      location: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/account");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/developers/u-dev");
  });

  it("404s on AuthError FORBIDDEN from the service", async () => {
    mocks.saveOwnProfile.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(saveDeveloperProfileAction(validInput)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a generic UNKNOWN and logs no profile content or contact email", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.saveOwnProfile.mockRejectedValue(new Error("neon down secret.contact@example.com"));
    const result = await saveDeveloperProfileAction(validInput);
    expect(result).toEqual({
      ok: false,
      code: "UNKNOWN",
      message: "No pudimos guardar tu perfil. Inténtalo de nuevo.",
    });
    expect(JSON.stringify(result)).not.toMatch(/neon|secret\.contact/);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/secret\.contact|Hola|github\.com/);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
