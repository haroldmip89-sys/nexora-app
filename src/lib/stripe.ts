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

/** Max age (seconds) of a webhook signature timestamp; same as the SDK default, never 0. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/** Webhook signing secret, read on every call (no client is created). Never echoes the value. */
export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new StripeConfigError(
      "STRIPE_WEBHOOK_SECRET is not defined. Set it in .env.local (the whsec_... printed by `stripe listen`).",
    );
  }
  if (!secret.startsWith("whsec_")) {
    throw new StripeConfigError(
      "STRIPE_WEBHOOK_SECRET has an unexpected format; expected a Stripe webhook signing secret (whsec_...).",
    );
  }
  return secret;
}

/**
 * Verifies the signature over the raw body and returns the event. Uses the static
 * `Stripe.webhooks`, so it needs no STRIPE_SECRET_KEY. A missing secret throws
 * `StripeConfigError`; any other failure (signature, timestamp, JSON) is a plain error.
 */
export function constructStripeEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = getWebhookSecret();
  if (!signature) {
    throw new Error("Missing Stripe-Signature header");
  }
  return Stripe.webhooks.constructEvent(rawBody, signature, secret, WEBHOOK_TOLERANCE_SECONDS);
}

const DEFINITIVE_REJECTION_TYPES = new Set([
  "StripeInvalidRequestError",
  "StripeAuthenticationError",
  "StripePermissionError",
]);

/** Stripe certainly did not perform the operation (spec 009 RF4 classification). Everything else is ambiguous. */
export function isDefinitiveStripeRejection(error: unknown): boolean {
  const type = (error as { type?: unknown } | null | undefined)?.type;
  return typeof type === "string" && DEFINITIVE_REJECTION_TYPES.has(type);
}

const MAX_LOG_MESSAGE_LENGTH = 300;

/** Strips Stripe ids/keys, emails and URLs from a Stripe-generated message, then truncates it. */
function sanitizeStripeMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted]")
    .replace(/\S+@\S+/g, "[redacted]")
    .replace(
      /\b(acct|cus|cs|pi|pm|ch|evt|sk|rk|pk|whsec|tr|po|ba|card)_[A-Za-z0-9_]+/gi,
      "[redacted]",
    )
    .slice(0, MAX_LOG_MESSAGE_LENGTH);
}

/**
 * Safe fields for logs: type, code, statusCode and requestId. Only for
 * `StripeInvalidRequestError` (a message Stripe builds about the request shape) it also adds
 * the sanitized `message`; other types never log their message.
 */
export function stripeErrorLogFields(error: unknown): {
  type: unknown;
  code: unknown;
  statusCode: unknown;
  requestId: unknown;
  message?: string;
} {
  const e = (error ?? {}) as Record<string, unknown>;
  const fields = { type: e.type, code: e.code, statusCode: e.statusCode, requestId: e.requestId };
  if (e.type === "StripeInvalidRequestError" && typeof e.message === "string" && e.message !== "") {
    return { ...fields, message: sanitizeStripeMessage(e.message) };
  }
  return fields;
}

/** true only for https URLs whose host ends in ".stripe.com" (Checkout, Connect onboarding). */
export function isStripeHostedUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".stripe.com");
  } catch {
    return false;
  }
}
