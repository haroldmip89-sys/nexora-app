// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "drizzle");
const journal = JSON.parse(readFileSync(join(DIR, "meta", "_journal.json"), "utf8")) as {
  entries: { tag: string }[];
};

async function applyMigration(client: PGlite, index: number) {
  const sql = readFileSync(join(DIR, `${journal.entries[index].tag}.sql`), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.exec(statement);
  }
}

let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  await applyMigration(client, 0);
  await applyMigration(client, 1);
});
afterAll(async () => {
  await client.close();
});

async function seedProject(clientId: string, technologies: string[]) {
  const { rows } = await client.query<{ id: string }>(
    `insert into projects (client_id, title, category, description, budget_min_cents, budget_max_cents, timeline_weeks, technologies)
     values ($1, 't', 'c', 'd', 100, 100, 1, $2) returning id`,
    [clientId, technologies],
  );
  return rows[0].id;
}

describe("technologies seed and backfill migrations", () => {
  it("backfills tags from text[], then drops the column", async () => {
    const { rows: users } = await client.query<{ id: string }>(
      `insert into users (clerk_user_id, role, display_name, email) values ('c_bf', 'client', 'N', 'a@b.com') returning id`,
    );
    const mixed = await seedProject(users[0].id, ["react", " JAVA ", "Cobol", "Rpg", ""]);
    const empty = await seedProject(users[0].id, []);

    await applyMigration(client, 2);

    const tagsOf = async (projectId: string) =>
      (
        await client.query<{ slug: string }>(
          `select t.slug from project_technologies pt join technologies t on t.id = pt.technology_id
           where pt.project_id = $1 order by t.slug`,
          [projectId],
        )
      ).rows.map((r) => r.slug);

    expect(await tagsOf(mixed)).toEqual(["java", "otros", "react"]);
    expect(await tagsOf(empty)).toEqual([]);

    await applyMigration(client, 3);

    const { rows } = await client.query(
      `select 1 from information_schema.columns where table_name = 'projects' and column_name = 'technologies'`,
    );
    expect(rows).toHaveLength(0);
  });
});
