// @vitest-environment node
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const SECRET = "whsec_FAKESECRET1234567890abcdef";
const OTHER_SECRET = "whsec_OTHERSECRET1234567890abcdef";
const PAYLOAD = JSON.stringify({ id: "evt_test_1", object: "event", type: "checkout.session.completed" });

async function load() {
  vi.resetModules();
  return import("./stripe");
}

function sign(payload: string, secret: string, timestamp?: number) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
}

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected function to throw");
}

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getWebhookSecret", () => {
  it("does not throw on import without env vars", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    await expect(load()).resolves.toBeDefined();
  });

  it.each(["", "   "])("throws StripeConfigError when missing (%j)", async (value) => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", value);
    const { getWebhookSecret, StripeConfigError } = await load();
    expect(() => getWebhookSecret()).toThrow(StripeConfigError);
  });

  it("throws without echoing the value when the format is invalid", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "not-a-secret-XYZ123");
    const { getWebhookSecret, StripeConfigError } = await load();
    const error = catchError(() => getWebhookSecret());
    expect(error).toBeInstanceOf(StripeConfigError);
    expect((error as Error).message).not.toContain("XYZ123");
  });

  it("returns a valid trimmed secret", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", `  ${SECRET}  `);
    const { getWebhookSecret } = await load();
    expect(getWebhookSecret()).toBe(SECRET);
  });
});

describe("constructStripeEvent", () => {
  it("exports a 300 s tolerance", async () => {
    const { WEBHOOK_TOLERANCE_SECONDS } = await load();
    expect(WEBHOOK_TOLERANCE_SECONDS).toBe(300);
  });

  it("returns the event for a valid signature", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    const { constructStripeEvent } = await load();
    const event = constructStripeEvent(PAYLOAD, sign(PAYLOAD, SECRET));
    expect(event.id).toBe("evt_test_1");
    expect(event.type).toBe("checkout.session.completed");
  });

  it.each([null, ""])("rejects a missing signature (%j) with a non-config error", async (sig) => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    const { constructStripeEvent, StripeConfigError } = await load();
    const error = catchError(() => constructStripeEvent(PAYLOAD, sig));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(StripeConfigError);
  });

  it("rejects a tampered body", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    const { constructStripeEvent, StripeConfigError } = await load();
    const header = sign(PAYLOAD, SECRET);
    const error = catchError(() => constructStripeEvent(`${PAYLOAD} `, header));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(StripeConfigError);
  });

  it("rejects a signature made with a different secret", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    const { constructStripeEvent, StripeConfigError } = await load();
    const error = catchError(() => constructStripeEvent(PAYLOAD, sign(PAYLOAD, OTHER_SECRET)));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(StripeConfigError);
  });

  it("rejects a timestamp older than the tolerance and accepts one inside it", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    const { constructStripeEvent, StripeConfigError } = await load();
    const now = Math.floor(Date.now() / 1000);
    const error = catchError(() => constructStripeEvent(PAYLOAD, sign(PAYLOAD, SECRET, now - 301)));
    expect(error).not.toBeInstanceOf(StripeConfigError);
    expect(constructStripeEvent(PAYLOAD, sign(PAYLOAD, SECRET, now - 60)).id).toBe("evt_test_1");
  });

  it("throws StripeConfigError when the env secret is missing", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const { constructStripeEvent, StripeConfigError } = await load();
    expect(() => constructStripeEvent(PAYLOAD, sign(PAYLOAD, SECRET))).toThrow(StripeConfigError);
  });
});
