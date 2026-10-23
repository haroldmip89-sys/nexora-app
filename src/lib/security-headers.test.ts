import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import { extraCspDirectives, securityHeaders } from "./security-headers";

describe("securityHeaders", () => {
  it("has the exact D8 values", () => {
    expect(Object.fromEntries(securityHeaders.map((h) => [h.key, h.value]))).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Strict-Transport-Security": "max-age=63072000",
    });
  });

  it("does not set Cross-Origin-Opener-Policy", () => {
    expect(securityHeaders.some((h) => (h.key as string) === "Cross-Origin-Opener-Policy")).toBe(false);
  });
});

describe("extraCspDirectives", () => {
  it("adds the D9 directives", () => {
    expect(extraCspDirectives).toEqual({
      "frame-ancestors": ["'none'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
    });
  });
});

describe("next.config", () => {
  it("disables x-powered-by", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("applies the security headers to every route", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toHaveLength(1);
    expect(rules?.[0].source).toBe("/:path*");
    expect(rules?.[0].headers).toEqual([...securityHeaders]);
  });
});
