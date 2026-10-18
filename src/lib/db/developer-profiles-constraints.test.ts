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

async function createUser(): Promise<string> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into users (clerk_user_id, role, display_name, email) values ($1, 'developer', 'Name', 'a@b.com') returning id`,
    [`clerk_dp_${++seq}`],
  );
  return rows[0].id;
}

type Overrides = Partial<{
  headline: string;
  bio: string;
  location: string | null;
  contact_email: string | null;
  links: string;
  availability: string;
  contact_visibility: string;
}>;

async function insertProfile(userId: string, o: Overrides = {}) {
  const cols = ["user_id", "headline", "bio"];
  const vals: unknown[] = [userId, o.headline ?? "Dev", o.bio ?? "Bio"];
  const casts: Record<string, string> = { links: "::jsonb" };
  for (const key of ["location", "contact_email", "links", "availability", "contact_visibility"] as const) {
    if (key in o) {
      cols.push(key);
      vals.push(o[key]);
    }
  }
  const placeholders = cols.map((c, i) => `$${i + 1}${casts[c] ?? ""}`);
  return ctx.client.query(
    `insert into developer_profiles (${cols.join(", ")}) values (${placeholders.join(", ")})`,
    vals,
  );
}

const links = (n: number) =>
  JSON.stringify(Array.from({ length: n }, (_, i) => ({ type: "other", url: `https://x${i}.com` })));

describe("developer_profiles constraints", () => {
  it("keeps accepting a minimal row and applies defaults", async () => {
    const user = await createUser();
    await expect(insertProfile(user)).resolves.toBeDefined();
    const { rows } = await ctx.client.query<{
      availability: string;
      links: unknown;
      contact_visibility: string;
      location: string | null;
      contact_email: string | null;
    }>(`select availability, links, contact_visibility, location, contact_email from developer_profiles where user_id = $1`, [user]);
    expect(rows[0]).toEqual({
      availability: "available",
      links: [],
      contact_visibility: "accepted_client",
      location: null,
      contact_email: null,
    });
  });

  it("accepts values at the limits", async () => {
    await expect(
      insertProfile(await createUser(), {
        headline: "h".repeat(80),
        bio: "b".repeat(1000),
        location: "l".repeat(80),
        contact_email: "e".repeat(254),
        links: links(5),
      }),
    ).resolves.toBeDefined();
  });

  it("rejects a headline over 80 characters", async () => {
    await expect(insertProfile(await createUser(), { headline: "h".repeat(81) })).rejects.toThrow();
  });

  it("rejects a bio over 1000 characters", async () => {
    await expect(insertProfile(await createUser(), { bio: "b".repeat(1001) })).rejects.toThrow();
  });

  it("rejects a location over 80 characters", async () => {
    await expect(insertProfile(await createUser(), { location: "l".repeat(81) })).rejects.toThrow();
  });

  it("rejects a contact_email over 254 characters", async () => {
    await expect(
      insertProfile(await createUser(), { contact_email: "e".repeat(255) }),
    ).rejects.toThrow();
  });

  it("rejects links that are not an array", async () => {
    await expect(insertProfile(await createUser(), { links: "{}" })).rejects.toThrow();
    await expect(insertProfile(await createUser(), { links: '"x"' })).rejects.toThrow();
  });

  it("rejects more than 5 links", async () => {
    await expect(insertProfile(await createUser(), { links: links(6) })).rejects.toThrow();
  });

  it("rejects invalid enum values", async () => {
    await expect(insertProfile(await createUser(), { availability: "busy" })).rejects.toThrow();
    await expect(
      insertProfile(await createUser(), { contact_visibility: "everyone" }),
    ).rejects.toThrow();
  });

  it("rejects a second profile for the same user", async () => {
    const user = await createUser();
    await insertProfile(user);
    await expect(insertProfile(user)).rejects.toThrow();
  });

  it("deletes the profile when the user is deleted (cascade)", async () => {
    const user = await createUser();
    await insertProfile(user);
    await ctx.client.query(`delete from users where id = $1`, [user]);
    const { rows } = await ctx.client.query(`select 1 from developer_profiles where user_id = $1`, [user]);
    expect(rows).toHaveLength(0);
  });
});
