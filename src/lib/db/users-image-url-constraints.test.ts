// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

const insertUser = (imageUrl: string | null) =>
  ctx.client.query(
    `insert into users (clerk_user_id, role, display_name, email, image_url) values ($1, 'developer', 'Name', 'a@b.com', $2)`,
    [`clerk_img_${++seq}`, imageUrl],
  );

describe("users.image_url constraint", () => {
  it("accepts NULL", async () => {
    await expect(insertUser(null)).resolves.toBeDefined();
  });

  it("accepts a valid https url", async () => {
    await expect(insertUser("https://img.clerk.com/abc")).resolves.toBeDefined();
  });

  it("rejects an http url", async () => {
    await expect(insertUser("http://img.clerk.com/abc")).rejects.toThrow();
  });

  it("rejects urls longer than 2048 characters and accepts exactly 2048", async () => {
    const prefix = "https://img.clerk.com/";
    await expect(insertUser(prefix + "a".repeat(2048 - prefix.length))).resolves.toBeDefined();
    await expect(insertUser(prefix + "a".repeat(2048 - prefix.length + 1))).rejects.toThrow();
  });
});
