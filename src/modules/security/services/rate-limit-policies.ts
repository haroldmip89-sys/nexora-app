import type { RateLimitRule } from "@/lib/rate-limit";

/** Per-user fixed-window policies (spec 015 D6). Tune limits here only. */
export const RATE_LIMIT_POLICIES = {
  "checkout.start": { limit: 10, windowSeconds: 10 * 60 },
  "payment.refresh": { limit: 20, windowSeconds: 5 * 60 },
  "payment.cancel": { limit: 10, windowSeconds: 10 * 60 },
  "payout.onboarding": { limit: 10, windowSeconds: 10 * 60 },
  "payout.refresh": { limit: 20, windowSeconds: 5 * 60 },
  "transfer.retry": { limit: 10, windowSeconds: 10 * 60 },
  "project.write": { limit: 60, windowSeconds: 10 * 60 },
  "proposal.write": { limit: 60, windowSeconds: 10 * 60 },
  "proposal.select": { limit: 20, windowSeconds: 10 * 60 },
  "rating.write": { limit: 20, windowSeconds: 10 * 60 },
  "profile.save": { limit: 30, windowSeconds: 10 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitPolicy = keyof typeof RATE_LIMIT_POLICIES;
