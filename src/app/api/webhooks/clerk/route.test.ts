// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/webhooks", () => ({ verifyWebhook: vi.fn() }));
vi.mock("@/modules/auth/services/clerk-webhook.service", () => ({ handleClerkEvent: vi.fn() }));

import { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { POST } from "@/app/api/webhooks/clerk/route";
import { handleClerkEvent } from "@/modules/auth/services/clerk-webhook.service";

const request = () => new NextRequest("http://localhost/api/webhooks/clerk", { method: "POST", body: "{}" });

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 and skips the service when verification fails", async () => {
    vi.mocked(verifyWebhook).mockRejectedValueOnce(new Error("bad signature"));
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(handleClerkEvent).not.toHaveBeenCalled();
  });

  it("returns 200 and delegates the verified event", async () => {
    const evt = { type: "user.deleted", data: { id: "user_1" } };
    vi.mocked(verifyWebhook).mockResolvedValueOnce(evt as never);
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(handleClerkEvent).toHaveBeenCalledWith(evt);
  });

  it("returns 500 when the service throws", async () => {
    vi.mocked(verifyWebhook).mockResolvedValueOnce({ type: "user.updated", data: {} } as never);
    vi.mocked(handleClerkEvent).mockRejectedValueOnce(new Error("db down"));
    const res = await POST(request());
    expect(res.status).toBe(500);
  });
});
