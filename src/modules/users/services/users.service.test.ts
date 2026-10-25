// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

import * as service from "./users.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;
const nextId = () => `clerk_${++seq}`;

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
});
afterAll(async () => {
  await ctx.client.close();
});

const input = (over: Partial<Parameters<typeof service.registerUser>[0]> = {}) => ({
  clerkUserId: nextId(),
  role: "client" as const,
  displayName: "Ada Lovelace",
  email: "ada@example.com",
  ...over,
});

describe("registerUser", () => {
  it("creates the row", async () => {
    const i = input({ role: "developer" });
    const row = await service.registerUser(i);
    expect(row).toMatchObject({ clerkUserId: i.clerkUserId, role: "developer", email: i.email });
    expect(await service.findByClerkUserId(i.clerkUserId)).toEqual(row);
  });

  it("is idempotent and keeps the first role", async () => {
    const i = input({ role: "client" });
    const a = await service.registerUser(i);
    const b = await service.registerUser({ ...i, role: "developer", email: "other@example.com" });
    expect(b.id).toBe(a.id);
    expect(b.role).toBe("client");
    expect(b.email).toBe(i.email);
  });

  it("is safe under concurrency: one row, first role wins", async () => {
    const id = nextId();
    const results = await Promise.all([
      service.registerUser(input({ clerkUserId: id, role: "client" })),
      service.registerUser(input({ clerkUserId: id, role: "developer" })),
      service.registerUser(input({ clerkUserId: id, role: "client" })),
    ]);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(new Set(results.map((r) => r.role)).size).toBe(1);
    const { rows } = await ctx.client.query("select count(*)::int as n from users where clerk_user_id = $1", [id]);
    expect((rows[0] as { n: number }).n).toBe(1);
  });
});

const IMG = "https://img.clerk.com/abc123";

describe("registerUser image_url", () => {
  it("stores the image for developers", async () => {
    const row = await service.registerUser(input({ role: "developer", imageUrl: IMG }));
    expect(row.imageUrl).toBe(IMG);
  });

  it("does not store the image for clients", async () => {
    const row = await service.registerUser(input({ role: "client", imageUrl: IMG }));
    expect(row.imageUrl).toBeNull();
  });

  it("is idempotent: a second register changes neither role nor image", async () => {
    const i = input({ role: "developer", imageUrl: IMG });
    await service.registerUser(i);
    const b = await service.registerUser({
      ...i,
      role: "client",
      imageUrl: "https://img.clerk.com/other",
    });
    expect(b.role).toBe("developer");
    expect(b.imageUrl).toBe(IMG);
  });
});

describe("syncImageUrl", () => {
  it("stores, updates and clears the image of a developer without changing role", async () => {
    const row = await service.registerUser(input({ role: "developer" }));
    await service.syncImageUrl(row.clerkUserId, IMG);
    expect((await service.findByClerkUserId(row.clerkUserId))?.imageUrl).toBe(IMG);
    await service.syncImageUrl(row.clerkUserId, "https://img.clerk.com/new");
    expect((await service.findByClerkUserId(row.clerkUserId))?.imageUrl).toBe(
      "https://img.clerk.com/new",
    );
    await service.syncImageUrl(row.clerkUserId, null);
    const after = await service.findByClerkUserId(row.clerkUserId);
    expect(after?.imageUrl).toBeNull();
    expect(after?.role).toBe("developer");
  });

  it("does not create rows when missing", async () => {
    const id = nextId();
    await service.syncImageUrl(id, IMG);
    expect(await service.findByClerkUserId(id)).toBeNull();
  });

  it("is a no-op for anonymized accounts", async () => {
    const row = await service.registerUser(input({ role: "developer" }));
    await service.anonymizeByClerkUserId(row.clerkUserId);
    await service.syncImageUrl(row.clerkUserId, IMG);
    expect((await service.findByClerkUserId(row.clerkUserId))?.imageUrl).toBeNull();
  });

  it("is a no-op for clients", async () => {
    const row = await service.registerUser(input({ role: "client" }));
    await service.syncImageUrl(row.clerkUserId, IMG);
    const after = await service.findByClerkUserId(row.clerkUserId);
    expect(after?.imageUrl).toBeNull();
    expect(after?.role).toBe("client");
  });
});

describe("findByClerkUserId", () => {
  it("returns null when missing", async () => {
    expect(await service.findByClerkUserId("nope")).toBeNull();
  });
});

describe("syncProfile", () => {
  it("updates only display name and email", async () => {
    const row = await service.registerUser(input({ role: "developer" }));
    await service.syncProfile(row.clerkUserId, { displayName: "New Name", email: "new@example.com" });
    const after = await service.findByClerkUserId(row.clerkUserId);
    expect(after).toMatchObject({
      id: row.id,
      role: "developer",
      displayName: "New Name",
      email: "new@example.com",
    });
  });

  it("is idempotent", async () => {
    const row = await service.registerUser(input());
    const p = { displayName: "Same", email: "same@example.com" };
    await service.syncProfile(row.clerkUserId, p);
    const a = await service.findByClerkUserId(row.clerkUserId);
    await service.syncProfile(row.clerkUserId, p);
    const b = await service.findByClerkUserId(row.clerkUserId);
    expect(b).toMatchObject({ displayName: a!.displayName, email: a!.email });
  });

  it("does not create rows when missing", async () => {
    const id = nextId();
    await service.syncProfile(id, { displayName: "X", email: "x@example.com" });
    expect(await service.findByClerkUserId(id)).toBeNull();
  });

  it("does not revive anonymized rows", async () => {
    const row = await service.registerUser(input());
    await service.anonymizeByClerkUserId(row.clerkUserId);
    await service.syncProfile(row.clerkUserId, { displayName: "Back", email: "back@example.com" });
    const after = await service.findByClerkUserId(row.clerkUserId);
    expect(after?.displayName).toBe("Deleted user");
    expect(after?.email).toBe(`${row.id}@deleted.invalid`);
  });
});

describe("anonymizeByClerkUserId", () => {
  it("anonymizes, keeps id/clerkUserId/role and is idempotent", async () => {
    const row = await service.registerUser(input({ role: "developer" }));
    await service.anonymizeByClerkUserId(row.clerkUserId);
    await service.anonymizeByClerkUserId(row.clerkUserId);
    const after = await service.findByClerkUserId(row.clerkUserId);
    expect(after).toMatchObject({
      id: row.id,
      clerkUserId: row.clerkUserId,
      role: "developer",
      displayName: "Deleted user",
      email: `${row.id}@deleted.invalid`,
    });
  });

  it("clears image_url and is idempotent", async () => {
    const row = await service.registerUser(input({ role: "developer", imageUrl: IMG }));
    await service.anonymizeByClerkUserId(row.clerkUserId);
    await service.anonymizeByClerkUserId(row.clerkUserId);
    expect((await service.findByClerkUserId(row.clerkUserId))?.imageUrl).toBeNull();
  });

  it("is a no-op when the row is missing", async () => {
    await expect(service.anonymizeByClerkUserId(nextId())).resolves.toBeUndefined();
  });
});

describe("module surface", () => {
  it("exports no function that changes the role", () => {
    const functions = Object.entries(service)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key);
    expect(functions.sort()).toEqual(
      ["anonymizeByClerkUserId", "findByClerkUserId", "registerUser", "syncImageUrl", "syncProfile"].sort(),
    );
  });
});
