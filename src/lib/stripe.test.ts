// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const FAKE_TEST_KEY = "sk_test_FAKEKEY1234567890abcdef";
const FAKE_LIVE_KEY = "sk_live_FAKEKEY1234567890abcdef";

async function load() {
  vi.resetModules();
  return import("./stripe");
}

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected function to throw");
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getStripe", () => {
  it("does not throw when the module is imported without variables", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("APP_URL", "");
    await expect(load()).resolves.toBeDefined();
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])("throws StripeConfigError when the key is %s", async (_label, value) => {
    if (value === undefined) vi.stubEnv("STRIPE_SECRET_KEY", undefined);
    else vi.stubEnv("STRIPE_SECRET_KEY", value);
    const { getStripe, StripeConfigError } = await load();
    expect(() => getStripe()).toThrow(StripeConfigError);
    expect(messageOf(() => getStripe())).toContain("STRIPE_SECRET_KEY is not defined");
  });

  it.each(["sk_live_FAKEKEY1234567890abcdef", "rk_live_FAKEKEY1234567890abcdef"])(
    "rejects live key %s without leaking it",
    async (key) => {
      vi.stubEnv("STRIPE_SECRET_KEY", key);
      const { getStripe, StripeConfigError } = await load();
      expect(() => getStripe()).toThrow(StripeConfigError);
      const message = messageOf(() => getStripe());
      expect(message).toContain("live key");
      expect(message).not.toContain(key);
      expect(message).not.toContain("FAKEKEY");
    },
  );

  it.each(["pk_test_FAKEKEY123", "whsec_FAKEKEY123", "not-a-key", "sk_test_bad key"])(
    "rejects unexpected format %j without leaking it",
    async (key) => {
      vi.stubEnv("STRIPE_SECRET_KEY", key);
      const { getStripe, StripeConfigError } = await load();
      expect(() => getStripe()).toThrow(StripeConfigError);
      const message = messageOf(() => getStripe());
      expect(message).toContain("unexpected format");
      expect(message).not.toContain(key);
    },
  );

  it("rejects a bare sk_test_ prefix with no key body", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_");
    const { getStripe, StripeConfigError } = await load();
    expect(() => getStripe()).toThrow(StripeConfigError);
  });

  it("accepts a fake sk_test_ key and memoizes the instance", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", FAKE_TEST_KEY);
    const { getStripe } = await load();
    const first = getStripe();
    expect(first.checkout.sessions.create).toBeTypeOf("function");
    expect(getStripe()).toBe(first);
  });

  it("accepts a restricted rk_test_ key", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "rk_test_FAKEKEY1234567890abcdef");
    const { getStripe } = await load();
    expect(getStripe()).toBeDefined();
  });

  it("does not memoize after a failed validation", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", FAKE_LIVE_KEY);
    const { getStripe } = await load();
    expect(() => getStripe()).toThrow();
    vi.stubEnv("STRIPE_SECRET_KEY", FAKE_TEST_KEY);
    expect(getStripe()).toBeDefined();
  });
});

describe("getAppUrl", () => {
  it("returns a valid origin", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    const { getAppUrl } = await load();
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("strips the trailing slash and any path", async () => {
    vi.stubEnv("APP_URL", "https://app.example.com/some/path/");
    const { getAppUrl } = await load();
    expect(getAppUrl()).toBe("https://app.example.com");
  });

  it("throws when missing or empty", async () => {
    vi.stubEnv("APP_URL", "");
    const { getAppUrl, StripeConfigError } = await load();
    expect(() => getAppUrl()).toThrow(StripeConfigError);
    expect(messageOf(() => getAppUrl())).toContain("APP_URL is not defined");
  });

  it("throws when it is not a URL (no scheme)", async () => {
    vi.stubEnv("APP_URL", "localhost:3000x/path");
    const { getAppUrl, StripeConfigError } = await load();
    expect(() => getAppUrl()).toThrow(StripeConfigError);
  });

  it.each(["not a url", "ftp://example.com", "javascript:alert(1)"])(
    "throws for malformed or non-http value %j without leaking it",
    async (value) => {
      vi.stubEnv("APP_URL", value);
      const { getAppUrl, StripeConfigError } = await load();
      expect(() => getAppUrl()).toThrow(StripeConfigError);
      expect(messageOf(() => getAppUrl())).not.toContain(value);
    },
  );
});
