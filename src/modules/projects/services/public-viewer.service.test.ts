// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSessionUserId: vi.fn(),
  isProjectOwner: vi.fn(),
}));
vi.mock("@/modules/auth/services/current-user.service", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/modules/auth/services/clerk-identity.service", () => ({ getSessionUserId: mocks.getSessionUserId }));
vi.mock("@/modules/projects/services/public-catalog.service", () => ({ isProjectOwner: mocks.isProjectOwner }));

import { AuthError } from "@/modules/auth/services/auth-errors";
import { resolvePublicViewer } from "./public-viewer.service";

const user = (role: "client" | "developer" | "admin") => ({
  id: "user-1",
  clerkUserId: "clerk_1",
  role,
  displayName: "Someone",
  email: "someone@example.com",
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resolvePublicViewer", () => {
  it("returns visitor without a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getSessionUserId.mockResolvedValue(null);
    expect(await resolvePublicViewer("p1")).toEqual({ kind: "visitor" });
    expect(mocks.isProjectOwner).not.toHaveBeenCalled();
  });

  it("returns needs_onboarding with a session but no user row", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getSessionUserId.mockResolvedValue("clerk_9");
    expect(await resolvePublicViewer("p1")).toEqual({ kind: "needs_onboarding" });
  });

  it("returns isOwner true for the owner client", async () => {
    mocks.getCurrentUser.mockResolvedValue(user("client"));
    mocks.isProjectOwner.mockResolvedValue(true);
    expect(await resolvePublicViewer("p1")).toEqual({ kind: "user", role: "client", isOwner: true });
    expect(mocks.isProjectOwner).toHaveBeenCalledWith("p1", "user-1");
  });

  it("returns isOwner false for another client", async () => {
    mocks.getCurrentUser.mockResolvedValue(user("client"));
    mocks.isProjectOwner.mockResolvedValue(false);
    expect(await resolvePublicViewer("p1")).toEqual({ kind: "user", role: "client", isOwner: false });
  });

  it.each(["developer", "admin"] as const)("returns isOwner false for %s without querying ownership", async (role) => {
    mocks.getCurrentUser.mockResolvedValue(user(role));
    expect(await resolvePublicViewer("p1")).toEqual({ kind: "user", role, isOwner: false });
    expect(mocks.isProjectOwner).not.toHaveBeenCalled();
  });

  it("does not expose private user data", async () => {
    mocks.getCurrentUser.mockResolvedValue(user("developer"));
    expect(Object.keys(await resolvePublicViewer("p1")).sort()).toEqual(["isOwner", "kind", "role"]);
  });

  it("degrades to visitor on unexpected errors", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("db down"));
    expect(await resolvePublicViewer("p1")).toEqual({ kind: "visitor" });
  });

  it("degrades to visitor when the ownership lookup fails", async () => {
    mocks.getCurrentUser.mockResolvedValue(user("client"));
    mocks.isProjectOwner.mockRejectedValue(new Error("db down"));
    expect(await resolvePublicViewer("p1")).toEqual({ kind: "visitor" });
  });

  it("rethrows AuthError", async () => {
    mocks.getCurrentUser.mockRejectedValue(new AuthError("FORBIDDEN"));
    await expect(resolvePublicViewer("p1")).rejects.toBeInstanceOf(AuthError);
  });
});
