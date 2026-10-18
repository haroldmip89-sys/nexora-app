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

async function createUser(role = "developer"): Promise<string> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into users (clerk_user_id, role, display_name, email) values ($1, $2, 'Name', 'a@b.com') returning id`,
    [`clerk_ca_${++seq}`, role],
  );
  return rows[0].id;
}

const insert = (userId: string, stripeId: string | null, status = "not_started") =>
  ctx.client.query(
    `insert into connected_accounts (user_id, stripe_account_id, status) values ($1, $2, $3)`,
    [userId, stripeId, status],
  );

describe("connected_accounts constraints", () => {
  it("accepts a row without account and a row with account", async () => {
    await expect(insert(await createUser(), null)).resolves.toBeDefined();
    await expect(insert(await createUser(), "acct_fake_ok", "active")).resolves.toBeDefined();
  });

  it("rejects a second row for the same user", async () => {
    const user = await createUser();
    await insert(user, null);
    await expect(insert(user, null)).rejects.toThrow();
  });

  it("rejects two users sharing a stripe_account_id", async () => {
    await insert(await createUser(), "acct_fake_shared");
    await expect(insert(await createUser(), "acct_fake_shared")).rejects.toThrow();
  });

  it("rejects a non-initial status without stripe_account_id", async () => {
    await expect(insert(await createUser(), null, "active")).rejects.toThrow();
  });

  it("rejects a stripe_account_id without the acct_ prefix", async () => {
    await expect(insert(await createUser(), "xcct_fake")).rejects.toThrow();
    await expect(insert(await createUser(), "acctXfake")).rejects.toThrow();
  });

  it("rejects deleting a user that has a connected account (restrict)", async () => {
    const user = await createUser();
    await insert(user, null);
    await expect(ctx.client.query(`delete from users where id = $1`, [user])).rejects.toThrow();
  });
});
