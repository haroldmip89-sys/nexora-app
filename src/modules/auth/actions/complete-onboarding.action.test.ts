// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const getSessionUserId = vi.hoisted(() => vi.fn());
const getClerkProfile = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/services/clerk-identity.service", () => ({
  getSessionUserId,
  getClerkProfile,
}));

const registerUser = vi.hoisted(() => vi.fn());
vi.mock("@/modules/users/services/users.service", () => ({ registerUser }));

import { completeOnboarding } from "@/modules/auth/actions/complete-onboarding.action";

describe("completeOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserId.mockResolvedValue("user_1");
    getClerkProfile.mockResolvedValue({ displayName: "Ana Perez", email: "ana@example.com" });
    registerUser.mockResolvedValue({ id: "uuid", role: "client" });
  });

  it.each([{ role: "admin" }, { role: "" }, { role: "Client" }, {}, null, "client"])(
    "rejects invalid input %j without touching identity or the DB",
    async (input) => {
      const result = await completeOnboarding(input);
      expect(result.error).toBeTruthy();
      expect(registerUser).not.toHaveBeenCalled();
      expect(getSessionUserId).not.toHaveBeenCalled();
    },
  );

  it("redirects to /sign-in without a session and does not write", async () => {
    getSessionUserId.mockResolvedValue(null);
    await expect(completeOnboarding({ role: "client" })).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("registers with identity from Clerk (not from the input) and redirects to /", async () => {
    await expect(
      completeOnboarding({ role: "developer", email: "evil@x.com", clerkUserId: "user_2" }),
    ).rejects.toThrow("NEXT_REDIRECT:/");
    expect(registerUser).toHaveBeenCalledTimes(1);
    expect(registerUser).toHaveBeenCalledWith({
      clerkUserId: "user_1",
      role: "developer",
      displayName: "Ana Perez",
      email: "ana@example.com",
    });
  });

  it("returns an error when Clerk has no profile/email", async () => {
    getClerkProfile.mockResolvedValue(null);
    const result = await completeOnboarding({ role: "client" });
    expect(result.error).toBeTruthy();
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("returns an error when the DB write fails", async () => {
    registerUser.mockRejectedValue(new Error("db down"));
    const result = await completeOnboarding({ role: "client" });
    expect(result.error).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
