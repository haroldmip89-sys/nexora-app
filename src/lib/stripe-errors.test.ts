// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isDefinitiveStripeRejection,
  isStripeHostedUrl,
  stripeErrorLogFields,
} from "./stripe";

describe("isDefinitiveStripeRejection", () => {
  it.each(["StripeInvalidRequestError", "StripeAuthenticationError", "StripePermissionError"])(
    "is true for %s",
    (type) => {
      expect(isDefinitiveStripeRejection({ type })).toBe(true);
    },
  );

  it.each([
    "StripeConnectionError",
    "StripeAPIError",
    "StripeRateLimitError",
    "StripeIdempotencyError",
  ])("is false for %s", (type) => {
    expect(isDefinitiveStripeRejection({ type })).toBe(false);
  });

  it("is false for null, undefined, non-objects and objects without type", () => {
    expect(isDefinitiveStripeRejection(null)).toBe(false);
    expect(isDefinitiveStripeRejection(undefined)).toBe(false);
    expect(isDefinitiveStripeRejection("StripeInvalidRequestError")).toBe(false);
    expect(isDefinitiveStripeRejection(new Error("x"))).toBe(false);
    expect(isDefinitiveStripeRejection({})).toBe(false);
  });
});

describe("stripeErrorLogFields", () => {
  it("returns exactly type, code, statusCode and requestId, without message", () => {
    const fields = stripeErrorLogFields({
      type: "StripeAPIError",
      code: "x",
      statusCode: 500,
      requestId: "req_fake",
      message: "secret acct_fake detail",
      raw: { a: 1 },
    });
    expect(Object.keys(fields).sort()).toEqual(["code", "requestId", "statusCode", "type"]);
    expect(fields).toEqual({ type: "StripeAPIError", code: "x", statusCode: 500, requestId: "req_fake" });
  });

  it.each([
    "StripeAPIError",
    "StripeConnectionError",
    "StripeIdempotencyError",
    "StripeAuthenticationError",
  ])("never includes message for %s", (type) => {
    const fields = stripeErrorLogFields({ type, message: "detail", code: "c" });
    expect(Object.keys(fields).sort()).toEqual(["code", "requestId", "statusCode", "type"]);
  });

  it("includes the message for StripeInvalidRequestError", () => {
    const fields = stripeErrorLogFields({
      type: "StripeInvalidRequestError",
      code: "x",
      statusCode: 400,
      requestId: "req_fake",
      message: "Invalid country for this account",
    });
    expect(fields).toEqual({
      type: "StripeInvalidRequestError",
      code: "x",
      statusCode: 400,
      requestId: "req_fake",
      message: "Invalid country for this account",
    });
  });

  it("omits message when it is empty or not a string", () => {
    for (const message of ["", 42, undefined]) {
      const fields = stripeErrorLogFields({ type: "StripeInvalidRequestError", message });
      expect("message" in fields).toBe(false);
    }
  });

  it("redacts ids, keys, emails and URLs in the message", () => {
    const { message } = stripeErrorLogFields({
      type: "StripeInvalidRequestError",
      message:
        "No such account acct_FAKE123 with key sk_test_FAKEKEY for dev@example.com see https://docs.stripe.com/x?a=1 and cus_abc",
    });
    expect(message).toBe(
      "No such account [redacted] with key [redacted] for [redacted] see [redacted] and [redacted]",
    );
    expect(message).not.toMatch(/acct_|sk_test|@|https?:/);
  });

  it("truncates the message to 300 characters", () => {
    const { message } = stripeErrorLogFields({
      type: "StripeInvalidRequestError",
      message: "a".repeat(1000),
    });
    expect(message).toHaveLength(300);
  });

  it("tolerates null and undefined", () => {
    expect(stripeErrorLogFields(null)).toEqual({
      type: undefined,
      code: undefined,
      statusCode: undefined,
      requestId: undefined,
    });
    expect(Object.keys(stripeErrorLogFields(undefined))).toHaveLength(4);
  });
});

describe("isStripeHostedUrl", () => {
  it("accepts https stripe.com subdomains", () => {
    expect(isStripeHostedUrl("https://connect.stripe.com/setup/e/abc")).toBe(true);
    expect(isStripeHostedUrl("https://checkout.stripe.com/c/pay/cs_test_fake")).toBe(true);
  });

  it.each([
    "http://connect.stripe.com/x",
    "https://stripe.com.evil.io/x",
    "https://evilstripe.com/x",
    "https://stripe.com/x",
    "not a url",
    "",
  ])("rejects %j", (value) => {
    expect(isStripeHostedUrl(value)).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isStripeHostedUrl(null)).toBe(false);
    expect(isStripeHostedUrl(undefined)).toBe(false);
  });
});
