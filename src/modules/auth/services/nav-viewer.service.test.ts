// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { getCurrentUser, getSessionUserId } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSessionUserId: vi.fn(),
}));
vi.mock("@/modules/auth/services/current-user.service", () => ({ getCurrentUser }));
vi.mock("@/modules/auth/services/clerk-identity.service", () => ({ getSessionUserId }));

const { unstable_rethrow } = vi.hoisted(() => ({ unstable_rethrow: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow }));

import { resolveNavViewer } from "@/modules/auth/services/nav-viewer.service";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resolveNavViewer", () => {
  it("returns visitor without session", async () => {
    getCurrentUser.mockResolvedValue(null);
    getSessionUserId.mockResolvedValue(null);
    expect(await resolveNavViewer()).toEqual({ kind: "visitor" });
  });

  it("returns needs_onboarding with session but no row", async () => {
    getCurrentUser.mockResolvedValue(null);
    getSessionUserId.mockResolvedValue("clerk_1");
    expect(await resolveNavViewer()).toEqual({ kind: "needs_onboarding" });
  });

  it.each(["client", "developer", "admin"] as const)("returns user with role %s from the row", async (role) => {
    getCurrentUser.mockResolvedValue({ id: "u1", role });
    expect(await resolveNavViewer()).toEqual({ kind: "user", role });
    expect(getSessionUserId).not.toHaveBeenCalled();
  });

  it("returns degraded when getCurrentUser throws", async () => {
    getCurrentUser.mockRejectedValue(new Error("neon down"));
    expect(await resolveNavViewer()).toEqual({ kind: "degraded" });
    expect(console.error).toHaveBeenCalled();
  });

  it("returns visitor when getSessionUserId throws", async () => {
    getCurrentUser.mockResolvedValue(null);
    getSessionUserId.mockRejectedValue(new Error("clerk down"));
    expect(await resolveNavViewer()).toEqual({ kind: "visitor" });
    expect(console.error).toHaveBeenCalled();
  });

  it("propagates Next internal errors from getCurrentUser", async () => {
    const internal = new Error("DYNAMIC_SERVER_USAGE");
    getCurrentUser.mockRejectedValue(internal);
    unstable_rethrow.mockImplementation((e) => {
      throw e;
    });
    await expect(resolveNavViewer()).rejects.toBe(internal);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("propagates Next internal errors from getSessionUserId", async () => {
    const internal = new Error("DYNAMIC_SERVER_USAGE");
    getCurrentUser.mockResolvedValue(null);
    getSessionUserId.mockRejectedValue(internal);
    unstable_rethrow.mockImplementation((e) => {
      throw e;
    });
    await expect(resolveNavViewer()).rejects.toBe(internal);
    expect(console.error).not.toHaveBeenCalled();
  });
});
