import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  createRateLimiter,
  type RateLimitResult,
  type RateLimitStore,
} from "@/lib/rate-limit";
import { RATE_LIMIT_POLICIES, type RateLimitPolicy } from "./rate-limit-policies";

/** User-facing rejection message (spec 015 D7). Reused by the actions. */
export const RATE_LIMITED_MESSAGE =
  "Hiciste demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo.";

/** Minimal actor: the authenticated internal user (`users.id`). */
export type RateLimitActor = { id: string };

const CLEANUP_PROBABILITY = 1 / 100;
const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000;

/** Structural subset of a Drizzle client (Neon in production, PGlite in tests). */
export type RateLimitDb = {
  execute(query: SQL): PromiseLike<{ rows: Record<string, unknown>[] }>;
};

export type NeonRateLimitStore = RateLimitStore & {
  /** Deletes counters whose window started before `olderThanMs` (epoch ms). */
  deleteOlderThan(olderThanMs: number): Promise<void>;
};

/** Neon adapter: a single atomic upsert returning the new counter. */
export function createNeonRateLimitStore(database: RateLimitDb): NeonRateLimitStore {
  return {
    async increment(key, windowStartMs) {
      const windowStart = new Date(windowStartMs).toISOString();
      const result = await database.execute(sql`
        INSERT INTO rate_limit_hits (key, window_start, count)
        VALUES (${key}, ${windowStart}::timestamptz, 1)
        ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_hits.count + 1
        RETURNING count
      `);
      return Number(result.rows[0].count);
    },
    async deleteOlderThan(olderThanMs) {
      const threshold = new Date(olderThanMs).toISOString();
      await database.execute(sql`
        DELETE FROM rate_limit_hits WHERE window_start < ${threshold}::timestamptz
      `);
    },
  };
}

export type EnforceRateLimit = (
  actor: RateLimitActor,
  policy: RateLimitPolicy,
) => Promise<RateLimitResult>;

type Deps = {
  store: NeonRateLimitStore;
  now?: () => number;
  random?: () => number;
};

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export function createEnforceRateLimit({
  store,
  now = Date.now,
  random = Math.random,
}: Deps): EnforceRateLimit {
  const limiter = createRateLimiter({ store, now });

  return async (actor, policy) => {
    try {
      const result = await limiter.check(`${policy}:${actor.id}`, RATE_LIMIT_POLICIES[policy]);
      if (!result.ok) {
        console.warn("[rate-limit] blocked", { policy });
        return result;
      }
      if (random() < CLEANUP_PROBABILITY) {
        // Opportunistic cleanup: best effort, never affects the outcome.
        await store.deleteOlderThan(now() - CLEANUP_AGE_MS).catch(() => undefined);
      }
      return { ok: true };
    } catch (error) {
      // Fail-open (spec 015 D5): log only the error name, never the object.
      console.error("[rate-limit] store failed", { name: errorName(error) });
      return { ok: true };
    }
  };
}

/** Checks `policy` for `actor`. Never throws; fails open if storage fails. */
export const enforceRateLimit: EnforceRateLimit = (actor, policy) =>
  createEnforceRateLimit({ store: createNeonRateLimitStore(db) })(actor, policy);
