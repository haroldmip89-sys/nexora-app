// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createInMemoryRateLimitStore, createRateLimiter } from "./rate-limit";

const rule = { limit: 3, windowSeconds: 60 };

function setup(start = 600_000) {
  let t = start;
  const limiter = createRateLimiter({ store: createInMemoryRateLimitStore(), now: () => t });
  return { limiter, advance: (ms: number) => (t += ms) };
}

describe("createRateLimiter", () => {
  it("allows up to the limit and rejects the next call", async () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i++) expect(await limiter.check("a", rule)).toEqual({ ok: true });
    const blocked = await limiter.check("a", rule);
    expect(blocked.ok).toBe(false);
  });

  it("returns an integer retryAfterSeconds within 1..windowSeconds", async () => {
    const { limiter, advance } = setup(600_000); // window start, 60s left
    advance(10_500); // 49.5s left -> ceil 50
    for (let i = 0; i < 3; i++) await limiter.check("a", rule);
    expect(await limiter.check("a", rule)).toEqual({ ok: false, retryAfterSeconds: 50 });
  });

  it("clamps retryAfterSeconds to at least 1 at the end of the window", async () => {
    const { limiter, advance } = setup(600_000);
    advance(59_999);
    for (let i = 0; i < 3; i++) await limiter.check("a", rule);
    expect(await limiter.check("a", rule)).toEqual({ ok: false, retryAfterSeconds: 1 });
  });

  it("allows again in the next window", async () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 4; i++) await limiter.check("a", rule);
    advance(60_000);
    expect(await limiter.check("a", rule)).toEqual({ ok: true });
  });

  it("does not share counters between keys", async () => {
    const { limiter } = setup();
    for (let i = 0; i < 4; i++) await limiter.check("checkout.start:u1", rule);
    expect(await limiter.check("checkout.start:u2", rule)).toEqual({ ok: true });
    expect(await limiter.check("payment.refresh:u1", rule)).toEqual({ ok: true });
  });

  it("does not share state between limiters", async () => {
    const one = setup().limiter;
    const two = setup().limiter;
    for (let i = 0; i < 4; i++) await one.check("a", rule);
    expect(await two.check("a", rule)).toEqual({ ok: true });
  });
});
