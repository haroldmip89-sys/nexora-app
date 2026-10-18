import "server-only";

import Stripe from "stripe";

/**
 * Minimal Stripe boundary (server-only, Node.js runtime). Business logic
 * imports only from here, so tests can replace it with `vi.mock("@/lib/stripe")`.
 * Nothing is read at import time: the key is validated on first use, and error
 * messages never include the key or any part of it.
 */
export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
  }
}

const TEST_KEY_PATTERN = /^(sk|rk)_test_[A-Za-z0-9_]+$/;
const LIVE_KEY_PREFIXES = ["sk_live_", "rk_live_"];

const STRIPE_TIMEOUT_MS = 15_000;
const STRIPE_MAX_NETWORK_RETRIES = 2;

let instance: Stripe | undefined;

/** Returns the memoized Stripe client; only Stripe test keys are accepted. */
export function getStripe(): Stripe {
  if (instance) return instance;

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new StripeConfigError(
      "STRIPE_SECRET_KEY is not defined. Set it in .env.local (Stripe test secret key).",
    );
  }
  if (LIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    throw new StripeConfigError(
      "STRIPE_SECRET_KEY is a live key; only Stripe test keys (sk_test_...) are accepted.",
    );
  }
  if (!TEST_KEY_PATTERN.test(key)) {
    throw new StripeConfigError(
      "STRIPE_SECRET_KEY has an unexpected format; expected a Stripe test key (sk_test_...).",
    );
  }

  // No apiVersion: the SDK pins the one it was built against.
  instance = new Stripe(key, {
    maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
    timeout: STRIPE_TIMEOUT_MS,
  });
  return instance;
}

/** Public origin of the app (no trailing slash, no path) for Stripe return URLs. */
export function getAppUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) {
    throw new StripeConfigError(
      "APP_URL is not defined. Set it in .env.local (e.g. http://localhost:3000).",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new StripeConfigError(
      "APP_URL is not a valid URL; expected an http(s) origin such as http://localhost:3000.",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new StripeConfigError(
      "APP_URL must use http or https (e.g. http://localhost:3000).",
    );
  }
  return url.origin;
}
