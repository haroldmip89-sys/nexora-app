// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

describe("db client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not throw on import without DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(import("./client")).resolves.toBeDefined();
  });

  it("throws a clear error on first use without DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { db } = await import("./client");
    expect(() => db.select()).toThrow(/DATABASE_URL is not defined/);
  });

  it("throws on any property access without DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { db } = await import("./client");
    expect(() => db.transaction).toThrow(/DATABASE_URL is not defined/);
  });
});
