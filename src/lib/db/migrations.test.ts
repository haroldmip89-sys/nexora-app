// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");
const sqlFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
const sql = sqlFiles.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8")).join("\n");

describe("generated migration SQL", () => {
  it("has a single initial migration", () => {
    expect(sqlFiles).toHaveLength(1);
  });

  it("creates the 7 tables", () => {
    for (const table of [
      "users",
      "developer_profiles",
      "projects",
      "proposals",
      "proposal_selections",
      "payment_attempts",
      "processed_payment_events",
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("creates enums with the canonical ids", () => {
    expect(sql).toContain(`"project_status" AS ENUM('draft', 'published', 'proposal_selected', 'contracted', 'closed')`);
    expect(sql).toContain(`"proposal_status" AS ENUM('pending', 'accepted', 'rejected', 'withdrawn')`);
    expect(sql).toContain(
      `"payment_attempt_status" AS ENUM('pending', 'completed_test', 'failed', 'canceled')`,
    );
    expect(sql).toContain(`"user_role" AS ENUM('client', 'developer', 'admin')`);
    expect(sql).toContain(`"processed_event_result" AS ENUM('applied', 'ignored')`);
  });

  it("emits the partial unique indexes", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "proposals_one_accepted_per_project_idx"[^;]*WHERE "proposals"."status" = 'accepted'/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "payment_attempts_one_active_per_project_idx"[^;]*WHERE "payment_attempts"."status" IN \('pending', 'completed_test'\)/,
    );
  });

  it("emits the CHECK constraints", () => {
    for (const name of [
      "payment_attempts_amount_positive",
      "payment_attempts_currency_usd",
      "payment_attempts_livemode_false",
      "payment_attempts_completed_at_consistent",
      "projects_budget_min_positive",
      "projects_budget_range",
      "projects_currency_usd",
      "projects_timeline_positive",
      "projects_closed_at_matches_status",
      "proposals_price_positive",
      "proposals_currency_usd",
      "proposals_timeline_positive",
    ]) {
      expect(sql).toContain(`CONSTRAINT "${name}" CHECK`);
    }
  });

  it("emits the composite foreign keys", () => {
    expect(sql).toMatch(
      /"proposal_selections_proposal_project_fk" FOREIGN KEY \("proposal_id","project_id"\) REFERENCES "public"."proposals"\("id","project_id"\)/,
    );
    expect(sql).toMatch(
      /"payment_attempts_proposal_project_fk" FOREIGN KEY \("proposal_id","project_id"\) REFERENCES "public"."proposals"\("id","project_id"\)/,
    );
  });
});

describe("migration applied to PGlite", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    ctx = await createTestDb();
  });
  afterAll(async () => {
    await ctx.client.close();
  });

  it("creates all tables", async () => {
    const { rows } = await ctx.client.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "developer_profiles",
        "payment_attempts",
        "processed_payment_events",
        "projects",
        "proposal_selections",
        "proposals",
        "users",
      ]),
    );
  });

  it("creates the query indexes", async () => {
    const { rows } = await ctx.client.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public'`,
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        "projects_catalog_recent_idx",
        "projects_catalog_category_idx",
        "projects_client_created_idx",
        "proposals_developer_created_idx",
        "payment_attempts_project_created_idx",
      ]),
    );
  });

  it("rejects enum values outside the canonical ids", async () => {
    await expect(
      ctx.client.query(
        `insert into users (clerk_user_id, role, display_name, email) values ('c_enum', 'superuser', 'x', 'x@x.com')`,
      ),
    ).rejects.toThrow(/invalid input value for enum/);
    await expect(ctx.client.query(`select 'archived'::project_status`)).rejects.toThrow();
    await expect(ctx.client.query(`select 'paid'::payment_attempt_status`)).rejects.toThrow();
    await expect(ctx.client.query(`select 'open'::proposal_status`)).rejects.toThrow();
    await expect(ctx.client.query(`select 'other'::processed_event_result`)).rejects.toThrow();
  });
});
