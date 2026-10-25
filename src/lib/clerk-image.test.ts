// @vitest-environment node
import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import { CLERK_IMAGE_HOST, IMAGE_URL_MAX_LENGTH, normalizeClerkImageUrl } from "./clerk-image";

describe("normalizeClerkImageUrl", () => {
  it("accepts a valid img.clerk.com https url", () => {
    expect(normalizeClerkImageUrl("https://img.clerk.com/abc123", true)).toBe("https://img.clerk.com/abc123");
  });

  it("returns null when hasImage is not true", () => {
    expect(normalizeClerkImageUrl("https://img.clerk.com/abc", false)).toBeNull();
    expect(normalizeClerkImageUrl("https://img.clerk.com/abc", undefined)).toBeNull();
  });

  it.each([
    ["lookalike subdomain suffix", "https://img.clerk.com.evil.com/x"],
    ["host in path", "https://evil.com/img.clerk.com"],
    ["subdomain", "https://a.img.clerk.com/x"],
    ["http", "http://img.clerk.com/x"],
    ["javascript", "javascript:alert(1)"],
    ["data", "data:image/png;base64,AAAA"],
    ["empty", ""],
    ["not a url", "not a url"],
    ["port", "https://img.clerk.com:8443/x"],
    ["credentials", "https://user:pw@img.clerk.com/x"],
    ["query", "https://img.clerk.com/x?a=1"],
    ["hash", "https://img.clerk.com/x#frag"],
  ])("rejects %s", (_label, url) => {
    expect(normalizeClerkImageUrl(url, true)).toBeNull();
  });

  it("rejects non-string values", () => {
    expect(normalizeClerkImageUrl(undefined, true)).toBeNull();
    expect(normalizeClerkImageUrl(null, true)).toBeNull();
    expect(normalizeClerkImageUrl(42, true)).toBeNull();
  });

  it("enforces the max length", () => {
    const base = "https://img.clerk.com/";
    expect(normalizeClerkImageUrl(base + "a".repeat(IMAGE_URL_MAX_LENGTH - base.length), true)).not.toBeNull();
    expect(normalizeClerkImageUrl(base + "a".repeat(IMAGE_URL_MAX_LENGTH - base.length + 1), true)).toBeNull();
  });
});

describe("next.config images", () => {
  it("allows exactly one exact-host remote pattern", () => {
    const patterns = nextConfig.images?.remotePatterns;
    expect(patterns).toHaveLength(1);
    expect(patterns?.[0]).toMatchObject({
      protocol: "https",
      hostname: CLERK_IMAGE_HOST,
      port: "",
      search: "",
    });
    expect(CLERK_IMAGE_HOST).toBe("img.clerk.com");
    expect(String((patterns?.[0] as { hostname: string }).hostname)).not.toContain("*");
  });
});
