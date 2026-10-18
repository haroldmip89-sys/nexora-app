// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
const { getSessionUserId, findByClerkUserId } = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  findByClerkUserId: vi.fn(),
}));
vi.mock("@/modules/auth/services/clerk-identity.service", () => ({ getSessionUserId }));
vi.mock("@/modules/users/services/users.service", () => ({ findByClerkUserId }));

import { AuthError } from "@/modules/auth/services/auth-errors";
import {
  getCurrentUser,
  requireOwnership,
  requireRole,
  requireUser,
} from "@/modules/auth/services/current-user.service";
import type { AuthUser } from "@/modules/auth/types/auth.types";

const row = {
  id: "u1",
  clerkUserId: "clerk_1",
  role: "developer",
  displayName: "Ada",
  email: "ada@x.com",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: "u1",
  clerkUserId: "clerk_1",
  role: "client",
  displayName: "Ada",
  email: "ada@x.com",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e instanceof AuthError ? [e.code, e.status] : e;
  }
  return null;
}

describe("getCurrentUser", () => {
  it("returns null without session and does not query the DB", async () => {
    getSessionUserId.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
    expect(findByClerkUserId).not.toHaveBeenCalled();
  });

  it("returns null with session but no row", async () => {
    getSessionUserId.mockResolvedValue("clerk_1");
    findByClerkUserId.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the AuthUser with the role from the DB row only", async () => {
    getSessionUserId.mockResolvedValue("clerk_1");
    findByClerkUserId.mockResolvedValue(row);
    expect(await getCurrentUser()).toEqual({
      id: "u1",
      clerkUserId: "clerk_1",
      role: "developer",
      displayName: "Ada",
      email: "ada@x.com",
    });
    expect(findByClerkUserId).toHaveBeenCalledWith("clerk_1");
  });
});

describe("requireUser", () => {
  it("throws UNAUTHENTICATED (401) without session", async () => {
    getSessionUserId.mockResolvedValue(null);
    expect(await codeOf(requireUser())).toEqual(["UNAUTHENTICATED", 401]);
  });

  it("throws ONBOARDING_REQUIRED (403) with session but no row", async () => {
    getSessionUserId.mockResolvedValue("clerk_1");
    findByClerkUserId.mockResolvedValue(null);
    expect(await codeOf(requireUser())).toEqual(["ONBOARDING_REQUIRED", 403]);
  });

  it("returns the user when it exists", async () => {
    getSessionUserId.mockResolvedValue("clerk_1");
    findByClerkUserId.mockResolvedValue(row);
    expect((await requireUser()).id).toBe("u1");
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    getSessionUserId.mockResolvedValue("clerk_1");
  });

  it("throws FORBIDDEN (403) for a disallowed role", async () => {
    findByClerkUserId.mockResolvedValue(row);
    expect(await codeOf(requireRole("client"))).toEqual(["FORBIDDEN", 403]);
  });

  it("returns the user for an allowed role", async () => {
    findByClerkUserId.mockResolvedValue({ ...row, role: "client" });
    expect((await requireRole("client", "admin")).role).toBe("client");
  });

  it("propagates UNAUTHENTICATED", async () => {
    getSessionUserId.mockResolvedValue(null);
    expect(await codeOf(requireRole("client"))).toEqual(["UNAUTHENTICATED", 401]);
  });
});

describe("requireOwnership", () => {
  it("passes for the owner", () => {
    expect(() => requireOwnership(user(), "u1")).not.toThrow();
  });

  it("throws NOT_FOUND (404) for another user", () => {
    expect(() => requireOwnership(user({ id: "u2" }), "u1")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND", status: 404 }),
    );
  });

  it("admin passes only with allowAdmin", () => {
    const admin = user({ id: "a1", role: "admin" });
    expect(() => requireOwnership(admin, "u1")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(() => requireOwnership(admin, "u1", { allowAdmin: true })).not.toThrow();
  });

  it("allowAdmin does not help non-admins", () => {
    expect(() => requireOwnership(user({ id: "u2" }), "u1", { allowAdmin: true })).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
  });
});
