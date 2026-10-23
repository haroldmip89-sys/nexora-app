// Static security headers (spec 015 D8) and extra CSP directives (D9).
// Header values live here so next.config.ts and tests share one source.

export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // frame-ancestors is ignored in Report-Only CSP, so this is the effective
  // anti-clickjacking control for now.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // No includeSubDomains/preload: domain decision for the deploy spec (017).
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
] as const;

// Merged by clerkMiddleware with its own defaults (Clerk, Turnstile, Stripe).
export const extraCspDirectives = {
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
};
