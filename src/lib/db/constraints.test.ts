// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;
const next = () => ++seq;

beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.client.close();
});

async function one<T = { id: string }>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await ctx.client.query<T>(sql, params);
  return rows[0];
}

const createUser = (role = "client") =>
  one(
    `insert into users (clerk_user_id, role, display_name, email) values ($1, $2, 'Name', 'a@b.com') returning id`,
    [`clerk_${next()}`, role],
  ).then((r) => r.id);

async function createProject(clientId: string, over: Record<string, unknown> = {}) {
  const v = {
    budget_min_cents: 1000,
    budget_max_cents: 5000,
    currency: "USD",
    timeline_weeks: 4,
    status: "published",
    closed_at: null,
    ...over,
  };
  return (
    await one(
      `insert into projects (client_id, title, category, description, budget_min_cents, budget_max_cents, currency, timeline_weeks, status, closed_at)
       values ($1, 't', 'web', 'd', $2, $3, $4, $5, $6, $7) returning id`,
      [clientId, v.budget_min_cents, v.budget_max_cents, v.currency, v.timeline_weeks, v.status, v.closed_at],
    )
  ).id;
}

async function createProposal(projectId: string, developerId: string, over: Record<string, unknown> = {}) {
  const v = { price_cents: 2000, timeline_weeks: 3, status: "pending", ...over };
  return (
    await one(
      `insert into proposals (project_id, developer_id, price_cents, timeline_weeks, description, status)
       values ($1, $2, $3, $4, 'd', $5) returning id`,
      [projectId, developerId, v.price_cents, v.timeline_weeks, v.status],
    )
  ).id;
}

async function createAttempt(
  projectId: string,
  proposalId: string,
  clientId: string,
  over: Record<string, unknown> = {},
) {
  const v: Record<string, unknown> = {
    amount_cents: 2000,
    currency: "USD",
    status: "pending",
    session: null,
    intent: null,
    livemode: false,
    completed_at: null,
    ...over,
  };
  return (
    await one(
      `insert into payment_attempts (project_id, proposal_id, client_id, amount_cents, currency, status, stripe_checkout_session_id, stripe_payment_intent_id, livemode, completed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [
        projectId,
        proposalId,
        clientId,
        v.amount_cents,
        v.currency,
        v.status,
        v.session,
        v.intent,
        v.livemode,
        v.completed_at,
      ],
    )
  ).id;
}

/** Client + project + developer + proposal. */
async function scenario() {
  const clientId = await createUser("client");
  const developerId = await createUser("developer");
  const projectId = await createProject(clientId);
  const proposalId = await createProposal(projectId, developerId);
  return { clientId, developerId, projectId, proposalId };
}

const select = (projectId: string, proposalId: string, by: string) =>
  ctx.client.query(
    `insert into proposal_selections (project_id, proposal_id, selected_by) values ($1, $2, $3)`,
    [projectId, proposalId, by],
  );

describe("users and developer_profiles", () => {
  it("rejects duplicate clerk_user_id", async () => {
    await ctx.client.query(
      `insert into users (clerk_user_id, role, display_name, email) values ('dup', 'client', 'a', 'a@a.com')`,
    );
    await expect(
      ctx.client.query(
        `insert into users (clerk_user_id, role, display_name, email) values ('dup', 'developer', 'b', 'b@b.com')`,
      ),
    ).rejects.toThrow(/unique/i);
  });

  it("allows duplicate email", async () => {
    await createUser();
    await createUser();
  });

  it("allows one profile per user only", async () => {
    const userId = await createUser("developer");
    const insert = () =>
      ctx.client.query(`insert into developer_profiles (user_id, headline, bio) values ($1, 'h', 'b')`, [userId]);
    await insert();
    await expect(insert()).rejects.toThrow(/unique|primary/i);
    const { rows } = await ctx.client.query<{ technologies: string[] }>(
      `select technologies from developer_profiles where user_id = $1`,
      [userId],
    );
    expect(rows[0].technologies).toEqual([]);
  });

  it("cascades profile deletion with the user", async () => {
    const userId = await createUser("developer");
    await ctx.client.query(`insert into developer_profiles (user_id, headline, bio) values ($1, 'h', 'b')`, [userId]);
    await ctx.client.query(`delete from users where id = $1`, [userId]);
    const { rows } = await ctx.client.query(`select 1 from developer_profiles where user_id = $1`, [userId]);
    expect(rows).toHaveLength(0);
  });

  it("restricts deleting a user with projects or proposals", async () => {
    const s = await scenario();
    await expect(ctx.client.query(`delete from users where id = $1`, [s.clientId])).rejects.toThrow(/foreign key/i);
    await expect(ctx.client.query(`delete from users where id = $1`, [s.developerId])).rejects.toThrow(
      /foreign key/i,
    );
  });
});

describe("projects", () => {
  it("accepts a valid project with defaults", async () => {
    const clientId = await createUser();
    const { rows } = await ctx.client.query<{ status: string; currency: string }>(
      `insert into projects (client_id, title, category, description, budget_min_cents, budget_max_cents, timeline_weeks)
       values ($1, 't', 'c', 'd', 100, 100, 1) returning status, currency`,
      [clientId],
    );
    expect(rows[0]).toEqual({ status: "draft", currency: "USD" });
  });

  it.each([
    ["budget_min_cents <= 0", { budget_min_cents: 0, budget_max_cents: 10 }],
    ["budget_max_cents < budget_min_cents", { budget_min_cents: 500, budget_max_cents: 499 }],
    ["timeline_weeks <= 0", { timeline_weeks: 0 }],
    ["currency <> USD", { currency: "EUR" }],
    ["closed status without closed_at", { status: "closed", closed_at: null }],
    ["closed_at with non-closed status", { status: "published", closed_at: new Date() }],
  ])("rejects %s", async (_name, over) => {
    const clientId = await createUser();
    await expect(createProject(clientId, over)).rejects.toThrow(/check constraint/i);
  });

  it("accepts closed with closed_at", async () => {
    const clientId = await createUser();
    await createProject(clientId, { status: "closed", closed_at: new Date() });
  });

  it("rejects an unknown client (FK)", async () => {
    await expect(createProject("00000000-0000-0000-0000-000000000000")).rejects.toThrow(/foreign key/i);
  });
});

describe("technologies", () => {
  const insertTech = (slug: string, name: string, order = 5000) =>
    ctx.client.query(`insert into technologies (slug, name, sort_order) values ($1, $2, $3)`, [slug, name, order]);
  const link = (projectId: string, techId: string) =>
    ctx.client.query(`insert into project_technologies (project_id, technology_id) values ($1, $2)`, [
      projectId,
      techId,
    ]);
  const tagId = async (slug: string) =>
    (await one(`select id from technologies where slug = $1`, [slug])).id;

  it("rejects a duplicate slug", async () => {
    await insertTech("t-dup", "T Dup A");
    await expect(insertTech("t-dup", "T Dup B")).rejects.toThrow(/unique/i);
  });

  it("rejects a name that differs only in case", async () => {
    await insertTech("t-case-a", "CaseName");
    await expect(insertTech("t-case-b", "casename")).rejects.toThrow(/unique/i);
    await expect(insertTech("t-java-2", "java")).rejects.toThrow(/unique/i);
  });

  it.each(["C#", "a b", "-x", "x-", "A", "a--b"])("rejects invalid slug %s", async (slug) => {
    await expect(insertTech(slug, `Invalid ${slug}`)).rejects.toThrow(/check constraint/i);
  });

  it("rejects a repeated (project, tag) pair", async () => {
    const projectId = await createProject(await createUser());
    const react = await tagId("react");
    await link(projectId, react);
    await expect(link(projectId, react)).rejects.toThrow(/unique|duplicate/i);
  });

  it("rejects an unknown project or tag (FK)", async () => {
    const projectId = await createProject(await createUser());
    const ghost = "00000000-0000-0000-0000-000000000000";
    await expect(link(ghost, await tagId("react"))).rejects.toThrow(/foreign key/i);
    await expect(link(projectId, ghost)).rejects.toThrow(/foreign key/i);
  });

  it("restricts deleting a tag in use", async () => {
    const projectId = await createProject(await createUser());
    const go = await tagId("go");
    await link(projectId, go);
    await expect(ctx.client.query(`delete from technologies where id = $1`, [go])).rejects.toThrow(
      /foreign key/i,
    );
  });

  it("cascades bridge rows when a project is deleted", async () => {
    const projectId = await createProject(await createUser());
    await link(projectId, await tagId("rust"));
    await ctx.client.query(`delete from projects where id = $1`, [projectId]);
    const { rows } = await ctx.client.query(`select 1 from project_technologies where project_id = $1`, [
      projectId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("proposals", () => {
  it("rejects a second proposal from the same developer (even withdrawn)", async () => {
    const clientId = await createUser();
    const dev = await createUser("developer");
    const projectId = await createProject(clientId);
    await createProposal(projectId, dev, { status: "withdrawn" });
    await expect(createProposal(projectId, dev)).rejects.toThrow(/unique/i);
  });

  it("allows the same developer on different projects", async () => {
    const clientId = await createUser();
    const dev = await createUser("developer");
    await createProposal(await createProject(clientId), dev);
    await createProposal(await createProject(clientId), dev);
  });

  it("rejects a second accepted proposal per project", async () => {
    const clientId = await createUser();
    const projectId = await createProject(clientId);
    await createProposal(projectId, await createUser("developer"), { status: "accepted" });
    await expect(
      createProposal(projectId, await createUser("developer"), { status: "accepted" }),
    ).rejects.toThrow(/proposals_one_accepted_per_project_idx|unique/i);
  });

  it("allows one accepted plus rejected/pending/withdrawn", async () => {
    const clientId = await createUser();
    const projectId = await createProject(clientId);
    for (const status of ["accepted", "rejected", "pending", "withdrawn", "rejected"]) {
      await createProposal(projectId, await createUser("developer"), { status });
    }
  });

  it.each([
    ["price_cents <= 0", { price_cents: 0 }],
    ["timeline_weeks <= 0", { timeline_weeks: 0 }],
  ])("rejects %s", async (_name, over) => {
    const clientId = await createUser();
    const projectId = await createProject(clientId);
    await expect(createProposal(projectId, await createUser("developer"), over)).rejects.toThrow(
      /check constraint/i,
    );
  });

  it("rejects non-USD currency", async () => {
    const clientId = await createUser();
    const projectId = await createProject(clientId);
    await expect(
      ctx.client.query(
        `insert into proposals (project_id, developer_id, price_cents, currency, timeline_weeks, description) values ($1, $2, 1, 'EUR', 1, 'd')`,
        [projectId, await createUser("developer")],
      ),
    ).rejects.toThrow(/check constraint/i);
  });

  it("restricts deleting a project with proposals", async () => {
    const s = await scenario();
    await expect(ctx.client.query(`delete from projects where id = $1`, [s.projectId])).rejects.toThrow(
      /foreign key/i,
    );
  });
});

describe("proposal_selections", () => {
  it("accepts a selection and rejects a second one for the same project", async () => {
    const s = await scenario();
    const other = await createProposal(s.projectId, await createUser("developer"));
    await select(s.projectId, s.proposalId, s.clientId);
    await expect(select(s.projectId, other, s.clientId)).rejects.toThrow(/unique/i);
  });

  it("rejects a second selection of the same proposal", async () => {
    const s = await scenario();
    await select(s.projectId, s.proposalId, s.clientId);
    await expect(select(s.projectId, s.proposalId, s.clientId)).rejects.toThrow(/unique/i);
  });

  it("rejects a proposal from another project (composite FK)", async () => {
    const s = await scenario();
    const other = await scenario();
    await expect(select(s.projectId, other.proposalId, s.clientId)).rejects.toThrow(/foreign key/i);
  });

  it("restricts deleting a selected proposal", async () => {
    const s = await scenario();
    await select(s.projectId, s.proposalId, s.clientId);
    await expect(ctx.client.query(`delete from proposals where id = $1`, [s.proposalId])).rejects.toThrow(
      /foreign key/i,
    );
  });
});

describe("payment_attempts", () => {
  it("rejects two active attempts for one project", async () => {
    const s = await scenario();
    await createAttempt(s.projectId, s.proposalId, s.clientId);
    await expect(createAttempt(s.projectId, s.proposalId, s.clientId)).rejects.toThrow(/unique/i);
    await expect(
      createAttempt(s.projectId, s.proposalId, s.clientId, { status: "completed_test", completed_at: new Date() }),
    ).rejects.toThrow(/unique/i);
  });

  it("allows retry after failed or canceled", async () => {
    const s = await scenario();
    await createAttempt(s.projectId, s.proposalId, s.clientId, { status: "failed" });
    await createAttempt(s.projectId, s.proposalId, s.clientId, { status: "canceled" });
    await createAttempt(s.projectId, s.proposalId, s.clientId, { status: "pending" });
  });

  it.each([
    ["amount_cents = 0", { amount_cents: 0 }],
    ["amount_cents < 0", { amount_cents: -5 }],
    ["currency <> USD", { currency: "EUR" }],
    ["livemode = true", { livemode: true }],
    ["completed_test without completed_at", { status: "completed_test", completed_at: null }],
    ["completed_at with pending status", { status: "pending", completed_at: new Date() }],
  ])("rejects %s", async (_name, over) => {
    const s = await scenario();
    await expect(createAttempt(s.projectId, s.proposalId, s.clientId, over)).rejects.toThrow(/check constraint/i);
  });

  it("accepts completed_test with completed_at", async () => {
    const s = await scenario();
    await createAttempt(s.projectId, s.proposalId, s.clientId, {
      status: "completed_test",
      completed_at: new Date(),
    });
  });

  it("rejects a proposal from another project (composite FK)", async () => {
    const s = await scenario();
    const other = await scenario();
    await expect(createAttempt(s.projectId, other.proposalId, s.clientId)).rejects.toThrow(/foreign key/i);
  });

  it("rejects duplicate Stripe ids but allows many NULLs", async () => {
    const s = await scenario();
    const s2 = await scenario();
    await createAttempt(s.projectId, s.proposalId, s.clientId, {
      status: "failed",
      session: "cs_1",
      intent: "pi_1",
    });
    await expect(
      createAttempt(s2.projectId, s2.proposalId, s2.clientId, { session: "cs_1" }),
    ).rejects.toThrow(/unique/i);
    await expect(
      createAttempt(s2.projectId, s2.proposalId, s2.clientId, { intent: "pi_1" }),
    ).rejects.toThrow(/unique/i);
    await createAttempt(s.projectId, s.proposalId, s.clientId, { status: "failed" });
    await createAttempt(s.projectId, s.proposalId, s.clientId, { status: "canceled" });
  });
});

describe("processed_payment_events", () => {
  const insert = (id: string, extra = "") =>
    ctx.client.query(
      `insert into processed_payment_events (stripe_event_id, type, result) values ($1, 'checkout.session.completed', 'applied') ${extra}`,
      [id],
    );

  it("rejects a duplicate stripe_event_id", async () => {
    await insert("evt_1");
    await expect(insert("evt_1")).rejects.toThrow(/unique|primary/i);
  });

  it("is idempotent with ON CONFLICT DO NOTHING", async () => {
    const first = await insert("evt_2", "on conflict (stripe_event_id) do nothing returning stripe_event_id");
    const second = await insert("evt_2", "on conflict (stripe_event_id) do nothing returning stripe_event_id");
    expect(first.rows).toHaveLength(1);
    expect(second.rows).toHaveLength(0);
  });

  it("rejects an unknown result and an unknown attempt", async () => {
    await expect(
      ctx.client.query(
        `insert into processed_payment_events (stripe_event_id, type, result) values ('evt_3', 't', 'maybe')`,
      ),
    ).rejects.toThrow(/enum/i);
    await expect(
      ctx.client.query(
        `insert into processed_payment_events (stripe_event_id, type, result, payment_attempt_id) values ('evt_4', 't', 'applied', gen_random_uuid())`,
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("restricts deleting an attempt referenced by an event", async () => {
    const s = await scenario();
    const attemptId = await createAttempt(s.projectId, s.proposalId, s.clientId);
    await ctx.client.query(
      `insert into processed_payment_events (stripe_event_id, type, result, payment_attempt_id) values ('evt_5', 't', 'applied', $1)`,
      [attemptId],
    );
    await expect(ctx.client.query(`delete from payment_attempts where id = $1`, [attemptId])).rejects.toThrow(
      /foreign key/i,
    );
  });
});
