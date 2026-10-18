// @vitest-environment node
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/payments/services/payment-event.service", () => ({ handleStripeEvent: vi.fn() }));

import { NextRequest } from "next/server";
import { POST, runtime } from "@/app/api/webhooks/stripe/route";
import { handleStripeEvent } from "@/modules/payments/services/payment-event.service";

const SECRET = "whsec_test_secret";
const event = { id: "evt_1", object: "event", type: "checkout.session.completed", livemode: false, data: { object: {} } };
const payload = JSON.stringify(event);

function sign(body: string, opts: { secret?: string; timestamp?: number } = {}): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: opts.secret ?? SECRET,
    timestamp: opts.timestamp,
  });
}

function request(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (signature !== undefined) headers["stripe-signature"] = signature;
  return new NextRequest("http://localhost/api/webhooks/stripe", { method: "POST", body, headers });
}

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("runs on the Node.js runtime", () => {
    expect(runtime).toBe("nodejs");
  });

  it("returns 200 and delegates the verified event", async () => {
    const res = await POST(request(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
    expect(handleStripeEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "evt_1", type: event.type }));
  });

  it("returns 200 for any result the service returns", async () => {
    vi.mocked(handleStripeEvent).mockResolvedValueOnce({ result: "duplicate" });
    expect((await POST(request(payload, sign(payload)))).status).toBe(200);
  });

  it.each([
    ["missing header", () => request(payload)],
    ["empty header", () => request(payload, "")],
    ["tampered signature", () => request(payload, sign(payload).replace(/v1=[0-9a-f]/, "v1=0"))],
    ["tampered body", () => request(`${payload} `, sign(payload))],
    ["wrong secret", () => request(payload, sign(payload, { secret: "whsec_other" }))],
    [
      "old timestamp",
      () => request(payload, sign(payload, { timestamp: Math.floor(Date.now() / 1000) - 301 })),
    ],
    ["invalid JSON", () => request("not json", sign("not json"))],
  ])("returns 400 and skips the service: %s", async (_name, build) => {
    const res = await POST(build());
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid webhook");
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", ""],
    ["malformed", "not-a-webhook-secret"],
  ])("returns 500 without leaking the secret when it is %s", async (_name, value) => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", value);
    const signature = sign(payload);
    const res = await POST(request(payload, signature));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Webhook not configured");
    expect(handleStripeEvent).not.toHaveBeenCalled();
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain(signature);
    if (value) expect(logged).not.toContain(value);
  });

  it("returns 500 when the service throws, without logging the payload", async () => {
    vi.mocked(handleStripeEvent).mockRejectedValueOnce(new Error("db down"));
    const res = await POST(request(payload, sign(payload)));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Webhook processing failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("evt_1");
  });
});
