// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@/lib/db/test-db";
import { RATE_LIMIT_POLICIES } from "./rate-limit-policies";
import {
  createEnforceRateLimit,
  createNeonRateLimitStore,
  RATE_LIMITED_MESSAGE,
  type NeonRateLimitStore,
  type RateLimitDb,
} from "./rate-limit.service";

vi.mock("@/lib/db/client", () => ({ db: {} }));

const USER = { id: "11111111-1111-4111-8111-111111111111" };

function fakeStore(overrides: Partial<NeonRateLimitStore> = {}) {
  const counts = new Map<string, number>();
  const store: NeonRateLimitStore = {
    increment: vi.fn(async (key: string, windowStartMs: number) => {
      const id = `${key}@${windowStartMs}`;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      return counts.get(id)!;
    }),
    deleteOlderThan: vi.fn(async () => undefined),
    ...overrides,
  };
  return store;
}

afterEach(() => vi.restoreAllMocks());

describe("enforceRateLimit", () => {
  it("exposes the D7 message", () => {
    expect(RATE_LIMITED_MESSAGE).toBe(
      "Hiciste demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo.",
    );
  });

  it("uses the key <policy>:<users.id> and blocks past the limit", async () => {
    const store = fakeStore();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const enforce = createEnforceRateLimit({ store, now: () => 0, random: () => 1 });
    const { limit } = RATE_LIMIT_POLICIES["checkout.start"];
    for (let i = 0; i < limit; i++) {
      expect(await enforce(USER, "checkout.start")).toEqual({ ok: true });
    }
    expect(store.increment).toHaveBeenCalledWith(`checkout.start:${USER.id}`, 0);
    const blocked = await enforce(USER, "checkout.start");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(Number.isInteger(blocked.retryAfterSeconds)).toBe(true);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[rate-limit] blocked", { policy: "checkout.start" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(USER.id);
  });

  it("does not share counters between users or policies", async () => {
    const enforce = createEnforceRateLimit({ store: fakeStore(), now: () => 0, random: () => 1 });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { limit } = RATE_LIMIT_POLICIES["checkout.start"];
    for (let i = 0; i <= limit; i++) await enforce(USER, "checkout.start");
    expect(await enforce({ id: "other" }, "checkout.start")).toEqual({ ok: true });
    expect(await enforce(USER, "payment.cancel")).toEqual({ ok: true });
  });

  it("fails open and logs only the error name when the store throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const boom = new Error(`failed query for ${USER.id} ana@example.com`);
    boom.name = "DrizzleQueryError";
    const store = fakeStore({ increment: vi.fn().mockRejectedValue(boom) });
    const enforce = createEnforceRateLimit({ store });

    await expect(enforce(USER, "project.write")).resolves.toEqual({ ok: true });
    expect(error).toHaveBeenCalledWith("[rate-limit] store failed", { name: "DrizzleQueryError" });
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain(USER.id);
    expect(logged).not.toContain("ana@example.com");
  });

  it("runs cleanup only when the injected random falls under 1/100", async () => {
    const day = 24 * 60 * 60 * 1000;
    const hit = fakeStore();
    await createEnforceRateLimit({ store: hit, now: () => 10 * day, random: () => 0.005 })(
      USER,
      "profile.save",
    );
    expect(hit.deleteOlderThan).toHaveBeenCalledWith(9 * day);

    const miss = fakeStore();
    await createEnforceRateLimit({ store: miss, now: () => 10 * day, random: () => 0.5 })(
      USER,
      "profile.save",
    );
    expect(miss.deleteOlderThan).not.toHaveBeenCalled();
  });

  it("does not fail when cleanup fails", async () => {
    const store = fakeStore({ deleteOlderThan: vi.fn().mockRejectedValue(new Error("x")) });
    const enforce = createEnforceRateLimit({ store, random: () => 0 });
    await expect(enforce(USER, "profile.save")).resolves.toEqual({ ok: true });
  });
});

describe("createNeonRateLimitStore (PGlite with the real migration)", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let store: NeonRateLimitStore;

  beforeAll(async () => {
    ctx = await createTestDb();
    store = createNeonRateLimitStore(ctx.db as unknown as RateLimitDb);
  });
  afterAll(async () => {
    await ctx.client.close();
  });

  async function rows() {
    const { rows } = await ctx.client.query<{ key: string; count: number }>(
      "select key, count from rate_limit_hits order by key, window_start",
    );
    return rows;
  }

  it("increments atomically per (key, window) and returns the new count", async () => {
    const w = Date.UTC(2026, 0, 1);
    expect(await store.increment("a:u1", w)).toBe(1);
    expect(await store.increment("a:u1", w)).toBe(2);
    expect(await store.increment("a:u1", w + 60_000)).toBe(1);
    expect(await store.increment("a:u2", w)).toBe(1);
  });

  it("enforces the (key, window_start) primary key", async () => {
    await expect(
      ctx.db.execute(
        sql`insert into rate_limit_hits (key, window_start, count) select key, window_start, 1 from rate_limit_hits limit 1`,
      ),
    ).rejects.toThrow();
  });

  it("deletes only rows older than the threshold", async () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.UTC(2026, 5, 1);
    await store.increment("old:u", now - 2 * day);
    await store.increment("fresh:u", now - day / 2);
    await store.deleteOlderThan(now - day);
    const keys = (await rows()).map((r) => r.key);
    expect(keys).not.toContain("old:u");
    expect(keys).toContain("fresh:u");
  });
});
