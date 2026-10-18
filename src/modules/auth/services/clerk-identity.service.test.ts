// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { auth, currentUser } = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));

import {
  deriveDisplayName,
  getClerkProfile,
  getSessionUserId,
  pickPrimaryEmail,
} from "@/modules/auth/services/clerk-identity.service";

beforeEach(() => vi.clearAllMocks());

describe("deriveDisplayName", () => {
  it("joins trimmed first and last name", () => {
    expect(deriveDisplayName({ firstName: " Ada ", lastName: "Lovelace " })).toBe("Ada Lovelace");
  });

  it("uses a single name part when the other is missing", () => {
    expect(deriveDisplayName({ firstName: "Ada", lastName: null })).toBe("Ada");
  });

  it("falls back to username when the name is empty", () => {
    expect(deriveDisplayName({ firstName: " ", lastName: "", username: "ada99" })).toBe("ada99");
  });

  it("falls back to the email local part", () => {
    expect(deriveDisplayName({ username: "", email: "ada@example.com" })).toBe("ada");
  });

  it("returns empty string when nothing is available", () => {
    expect(deriveDisplayName({})).toBe("");
  });
});

describe("pickPrimaryEmail", () => {
  it("reads SDK camelCase entries", () => {
    const emails = [
      { id: "a", emailAddress: "a@x.com" },
      { id: "b", emailAddress: "b@x.com" },
    ];
    expect(pickPrimaryEmail(emails, "b")).toBe("b@x.com");
  });

  it("reads webhook snake_case entries", () => {
    expect(pickPrimaryEmail([{ id: "a", email_address: "a@x.com" }], "a")).toBe("a@x.com");
  });

  it("returns null without primary id, match or list", () => {
    expect(pickPrimaryEmail([{ id: "a", emailAddress: "a@x.com" }], null)).toBeNull();
    expect(pickPrimaryEmail([{ id: "a", emailAddress: "a@x.com" }], "z")).toBeNull();
    expect(pickPrimaryEmail(undefined, "a")).toBeNull();
  });
});

describe("getSessionUserId", () => {
  it("returns the Clerk user id", async () => {
    auth.mockResolvedValue({ userId: "user_1" });
    expect(await getSessionUserId()).toBe("user_1");
  });

  it("returns null without session", async () => {
    auth.mockResolvedValue({ userId: null });
    expect(await getSessionUserId()).toBeNull();
  });
});

describe("getClerkProfile", () => {
  it("maps the SDK user to name and primary email", async () => {
    currentUser.mockResolvedValue({
      firstName: "Ada",
      lastName: "Lovelace",
      username: null,
      primaryEmailAddress: { emailAddress: "ada@x.com" },
    });
    expect(await getClerkProfile()).toEqual({ displayName: "Ada Lovelace", email: "ada@x.com" });
  });

  it("returns null without user or primary email", async () => {
    currentUser.mockResolvedValue(null);
    expect(await getClerkProfile()).toBeNull();
    currentUser.mockResolvedValue({ firstName: "A", primaryEmailAddress: null });
    expect(await getClerkProfile()).toBeNull();
  });
});
