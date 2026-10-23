/** Storage port: atomically increments the counter of (key, window) and returns the new value. */
export interface RateLimitStore {
  increment(key: string, windowStartMs: number): Promise<number>;
}

export type RateLimitRule = { limit: number; windowSeconds: number };

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export type RateLimiter = {
  check(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
};

/**
 * Fixed-window limiter. `windowStart = floor(now / window) * window`.
 * Worst-case burst at a window edge is 2x the limit (accepted, see spec 015 D2).
 */
export function createRateLimiter({
  store,
  now = Date.now,
}: {
  store: RateLimitStore;
  now?: () => number;
}): RateLimiter {
  return {
    async check(key, { limit, windowSeconds }) {
      const windowMs = windowSeconds * 1000;
      const current = now();
      const windowStartMs = Math.floor(current / windowMs) * windowMs;
      const count = await store.increment(key, windowStartMs);
      if (count <= limit) return { ok: true };
      const remainingMs = windowStartMs + windowMs - current;
      const retryAfterSeconds = Math.min(windowSeconds, Math.max(1, Math.ceil(remainingMs / 1000)));
      return { ok: false, retryAfterSeconds };
    },
  };
}

/** In-memory store. Tests only: not reliable in serverless (per-instance state). */
export function createInMemoryRateLimitStore(): RateLimitStore {
  const counters = new Map<string, number>();
  return {
    async increment(key, windowStartMs) {
      const id = `${key}@${windowStartMs}`;
      const next = (counters.get(id) ?? 0) + 1;
      counters.set(id, next);
      return next;
    },
  };
}
