// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@/modules/users/services/users.service", () => ({
  syncProfile: vi.fn(),
  anonymizeByClerkUserId: vi.fn(),
}));

import { handleClerkEvent } from "@/modules/auth/services/clerk-webhook.service";
import { anonymizeByClerkUserId, syncProfile } from "@/modules/users/services/users.service";

const asEvent = (e: unknown) => e as WebhookEvent;

const updated = (data: Record<string, unknown> = {}) =>
  asEvent({
    type: "user.updated",
    data: {
      id: "user_1",
      first_name: "Ada",
      last_name: "Lovelace",
      username: null,
      primary_email_address_id: "e1",
      email_addresses: [
        { id: "e0", email_address: "old@example.com" },
        { id: "e1", email_address: "ada@example.com" },
      ],
      ...data,
    },
  });

describe("handleClerkEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("syncs display name and primary email on user.updated", async () => {
    await handleClerkEvent(updated());
    expect(syncProfile).toHaveBeenCalledWith("user_1", {
      displayName: "Ada Lovelace",
      email: "ada@example.com",
    });
  });

  it("falls back to username, then email local part, when the name is empty", async () => {
    await handleClerkEvent(updated({ first_name: "", last_name: null, username: "ada99" }));
    expect(syncProfile).toHaveBeenLastCalledWith("user_1", {
      displayName: "ada99",
      email: "ada@example.com",
    });
    await handleClerkEvent(updated({ first_name: null, last_name: null, username: null }));
    expect(syncProfile).toHaveBeenLastCalledWith("user_1", {
      displayName: "ada",
      email: "ada@example.com",
    });
  });

  it("does nothing on user.updated without a primary email", async () => {
    await handleClerkEvent(updated({ primary_email_address_id: null }));
    await handleClerkEvent(updated({ email_addresses: [] }));
    expect(syncProfile).not.toHaveBeenCalled();
  });

  it("anonymizes on user.deleted", async () => {
    await handleClerkEvent(asEvent({ type: "user.deleted", data: { id: "user_1", deleted: true } }));
    expect(anonymizeByClerkUserId).toHaveBeenCalledWith("user_1");
  });

  it("ignores user.deleted without id", async () => {
    await handleClerkEvent(asEvent({ type: "user.deleted", data: { deleted: true } }));
    expect(anonymizeByClerkUserId).not.toHaveBeenCalled();
  });

  it("has no effect on other event types", async () => {
    await handleClerkEvent(asEvent({ type: "user.created", data: { id: "user_1" } }));
    await handleClerkEvent(asEvent({ type: "session.created", data: { id: "sess_1" } }));
    expect(syncProfile).not.toHaveBeenCalled();
    expect(anonymizeByClerkUserId).not.toHaveBeenCalled();
  });

  it("propagates data layer errors", async () => {
    vi.mocked(syncProfile).mockRejectedValueOnce(new Error("db down"));
    await expect(handleClerkEvent(updated())).rejects.toThrow("db down");
  });
});
