// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const currentUser = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
const syncImageUrl = vi.hoisted(() => vi.fn());
vi.mock("@/modules/users/services/users.service", () => ({ syncImageUrl }));

import { refreshOwnImage } from "@/modules/auth/services/own-image-sync.service";

const URL_OK = "https://img.clerk.com/abc";

describe("refreshOwnImage", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    syncImageUrl.mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("saves the normalized photo", async () => {
    currentUser.mockResolvedValue({ imageUrl: URL_OK, hasImage: true });
    await refreshOwnImage("user_1");
    expect(syncImageUrl).toHaveBeenCalledWith("user_1", URL_OK);
  });

  it("clears the photo when Clerk has no image or the host is not allowed", async () => {
    currentUser.mockResolvedValue({ imageUrl: URL_OK, hasImage: false });
    await refreshOwnImage("user_1");
    expect(syncImageUrl).toHaveBeenLastCalledWith("user_1", null);
    currentUser.mockResolvedValue({ imageUrl: "https://evil.com/x", hasImage: true });
    await refreshOwnImage("user_1");
    expect(syncImageUrl).toHaveBeenLastCalledWith("user_1", null);
  });

  it("does nothing without a Clerk user", async () => {
    currentUser.mockResolvedValue(null);
    await refreshOwnImage("user_1");
    expect(syncImageUrl).not.toHaveBeenCalled();
  });

  it("never throws when Clerk fails and logs only name and code", async () => {
    currentUser.mockRejectedValue(Object.assign(new Error(`boom ${URL_OK}`), { code: "E1" }));
    await expect(refreshOwnImage("user_1")).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const args = errorSpy.mock.calls[0];
    expect(args[1]).toEqual({ name: "Error", code: "E1" });
    expect(JSON.stringify(args)).not.toContain("img.clerk.com");
  });

  it("never throws when the service fails", async () => {
    currentUser.mockResolvedValue({ imageUrl: URL_OK, hasImage: true });
    syncImageUrl.mockRejectedValue(new Error(`db ${URL_OK}`));
    await expect(refreshOwnImage("user_1")).resolves.toBeUndefined();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("img.clerk.com");
  });
});
