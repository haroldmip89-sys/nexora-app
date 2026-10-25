// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

import { AuthError } from "@/modules/auth/services/auth-errors";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { projects } from "@/modules/projects/schema/projects.table";
import type { ProjectStatus } from "@/modules/projects/types/project.types";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { developerRatings } from "@/modules/ratings/schema/developer-ratings.table";
import type { DeveloperRatingSummary } from "@/modules/profile/types/developer-profile.types";
import { users } from "@/modules/users/schema/users.table";
import { RatingError } from "./rating-errors";
import { RATING_EDIT_WINDOW_MS } from "./rating-window";
import {
  createDeveloperRating,
  getDeveloperRatingSummary,
  getProjectRatingView,
  listDeveloperRatings,
  updateDeveloperRating,
} from "./rating.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;
let client: AuthUser;
let otherClient: AuthUser;
let developer: AuthUser;
let admin: AuthUser;

async function seedUser(role: AuthUser["role"], displayName?: string): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_r_${n}`, role, displayName: displayName ?? `User ${n}`, email: `r${n}@example.com` })
    .returning();
  return { id: row.id, clerkUserId: row.clerkUserId, role, displayName: row.displayName, email: row.email };
}

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  client = await seedUser("client", "Maria Gomez");
  otherClient = await seedUser("client", "Otro Cliente");
  developer = await seedUser("developer");
  admin = await seedUser("admin");
});
afterAll(async () => {
  await ctx.client.close();
});

type SeedOpts = { status?: ProjectStatus; contracted?: boolean; owner?: AuthUser; dev?: AuthUser };

/** Project with an accepted proposal (+ selection). Returns ids. */
async function seedProject(opts: SeedOpts = {}) {
  const { status = "contracted", contracted = status === "contracted", owner = client } = opts;
  const dev = opts.dev ?? (await seedUser("developer", "Dana Developer"));
  const [project] = await ctx.db
    .insert(projects)
    .values({
      clientId: owner.id,
      title: "Landing page",
      category: "Frontend & UI/UX",
      description: "We need a modern landing page for our bakery.",
      budgetMinCents: 100_000,
      budgetMaxCents: 200_000,
      timelineWeeks: 4,
      status,
      publishedAt: new Date(),
      contractedAt: contracted ? new Date() : null,
      closedAt: status === "closed" ? new Date() : null,
    })
    .returning();
  const [accepted] = await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: dev.id, priceCents: 150_000, timelineWeeks: 3, description: "d", status: "accepted" })
    .returning();
  const other = await seedUser("developer");
  await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: other.id, priceCents: 9, timelineWeeks: 9, description: "d", status: "rejected" });
  await ctx.db.insert(proposalSelections).values({ projectId: project.id, proposalId: accepted.id, selectedBy: owner.id });
  return { projectId: project.id, proposalId: accepted.id, developerId: dev.id };
}

async function rejectsWith(p: Promise<unknown>, code: string, kind: "auth" | "rating" = "auth") {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(kind === "auth" ? AuthError : RatingError);
  expect((err as { code: string }).code).toBe(code);
}

const input = (rating: number, comment: string | null = null) => ({ rating, comment });
const ratingRows = (projectId: string) =>
  ctx.db.select().from(developerRatings).where(eq(developerRatings.projectId, projectId));

describe("createDeveloperRating", () => {
  it("creates the rating with the accepted proposal and returns the developerId", async () => {
    const seed = await seedProject();
    const result = await createDeveloperRating(client, seed.projectId, input(5, "Great"));
    expect(result).toEqual({ developerId: seed.developerId });
    const rows = await ratingRows(seed.projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ proposalId: seed.proposalId, rating: 5, comment: "Great" });
  });

  it.each(["published", "proposal_selected"] as const)("%s project: NOT_CONTRACTED, nothing written", async (status) => {
    const seed = await seedProject({ status });
    await rejectsWith(createDeveloperRating(client, seed.projectId, input(4)), "NOT_CONTRACTED", "rating");
    expect(await ratingRows(seed.projectId)).toHaveLength(0);
  });

  it("closed without contracted_at: NOT_CONTRACTED", async () => {
    const seed = await seedProject({ status: "closed", contracted: false });
    await rejectsWith(createDeveloperRating(client, seed.projectId, input(4)), "NOT_CONTRACTED", "rating");
    expect(await ratingRows(seed.projectId)).toHaveLength(0);
  });

  it("closed after being contracted can be rated", async () => {
    const seed = await seedProject({ status: "closed", contracted: true });
    await expect(createDeveloperRating(client, seed.projectId, input(3))).resolves.toEqual({ developerId: seed.developerId });
  });

  it("second creation: ALREADY_RATED, a single row and the first values kept", async () => {
    const seed = await seedProject();
    await createDeveloperRating(client, seed.projectId, input(5));
    await rejectsWith(createDeveloperRating(client, seed.projectId, input(1)), "ALREADY_RATED", "rating");
    const rows = await ratingRows(seed.projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0].rating).toBe(5);
  });

  it("simultaneous creations leave a single row", async () => {
    const seed = await seedProject();
    const results = await Promise.allSettled([
      createDeveloperRating(client, seed.projectId, input(5)),
      createDeveloperRating(client, seed.projectId, input(2)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as RatingError).code).toBe("ALREADY_RATED");
    expect(await ratingRows(seed.projectId)).toHaveLength(1);
  });

  it("developer and admin get FORBIDDEN (even for unknown projects: no DB lookup first)", async () => {
    const seed = await seedProject();
    await rejectsWith(createDeveloperRating(developer, seed.projectId, input(5)), "FORBIDDEN");
    await rejectsWith(createDeveloperRating(admin, seed.projectId, input(5)), "FORBIDDEN");
    await rejectsWith(createDeveloperRating(developer, "00000000-0000-4000-8000-000000000000", input(5)), "FORBIDDEN");
    expect(await ratingRows(seed.projectId)).toHaveLength(0);
  });

  it("foreign client and unknown project get NOT_FOUND without writing", async () => {
    const seed = await seedProject();
    await rejectsWith(createDeveloperRating(otherClient, seed.projectId, input(5)), "NOT_FOUND");
    await rejectsWith(createDeveloperRating(client, "00000000-0000-4000-8000-000000000000", input(5)), "NOT_FOUND");
    expect(await ratingRows(seed.projectId)).toHaveLength(0);
  });
});

describe("updateDeveloperRating", () => {
  async function seedRated() {
    const seed = await seedProject();
    await createDeveloperRating(client, seed.projectId, input(5, "Great"));
    const [row] = await ratingRows(seed.projectId);
    return { ...seed, createdAt: row.createdAt };
  }

  it("inside the window updates rating and comment, keeps created_at and proposal_id, returns developerId", async () => {
    const seed = await seedRated();
    const now = () => new Date(seed.createdAt.getTime() + 1000);
    const result = await updateDeveloperRating(client, seed.projectId, input(2, "Meh"), { now });
    expect(result).toEqual({ developerId: seed.developerId });
    const [row] = await ratingRows(seed.projectId);
    expect(row).toMatchObject({ rating: 2, comment: "Meh", proposalId: seed.proposalId });
    expect(row.createdAt.getTime()).toBe(seed.createdAt.getTime());
  });

  it("can clear the comment (null)", async () => {
    const seed = await seedRated();
    await updateDeveloperRating(client, seed.projectId, input(4, null), { now: () => seed.createdAt });
    expect((await ratingRows(seed.projectId))[0].comment).toBeNull();
  });

  it("at created_at + 336 h - 1 ms still edits", async () => {
    const seed = await seedRated();
    const now = () => new Date(seed.createdAt.getTime() + RATING_EDIT_WINDOW_MS - 1);
    await expect(updateDeveloperRating(client, seed.projectId, input(1), { now })).resolves.toEqual({
      developerId: seed.developerId,
    });
    expect((await ratingRows(seed.projectId))[0].rating).toBe(1);
  });

  it("at created_at + 336 h: EDIT_WINDOW_CLOSED, unchanged", async () => {
    const seed = await seedRated();
    const now = () => new Date(seed.createdAt.getTime() + RATING_EDIT_WINDOW_MS);
    await rejectsWith(updateDeveloperRating(client, seed.projectId, input(1, "late"), { now }), "EDIT_WINDOW_CLOSED", "rating");
    expect((await ratingRows(seed.projectId))[0]).toMatchObject({ rating: 5, comment: "Great" });
  });

  it("editing does not extend the window", async () => {
    const seed = await seedRated();
    const almost = () => new Date(seed.createdAt.getTime() + RATING_EDIT_WINDOW_MS - 1);
    await updateDeveloperRating(client, seed.projectId, input(3), { now: almost });
    const closed = () => new Date(seed.createdAt.getTime() + RATING_EDIT_WINDOW_MS + 1000);
    await rejectsWith(updateDeveloperRating(client, seed.projectId, input(4), { now: closed }), "EDIT_WINDOW_CLOSED", "rating");
    expect((await ratingRows(seed.projectId))[0].rating).toBe(3);
  });

  it("without a previous rating: RATING_NOT_FOUND", async () => {
    const seed = await seedProject();
    await rejectsWith(updateDeveloperRating(client, seed.projectId, input(3)), "RATING_NOT_FOUND", "rating");
  });

  it("developer and admin get FORBIDDEN; foreign client NOT_FOUND, without changes", async () => {
    const seed = await seedRated();
    const now = () => seed.createdAt;
    await rejectsWith(updateDeveloperRating(developer, seed.projectId, input(1), { now }), "FORBIDDEN");
    await rejectsWith(updateDeveloperRating(admin, seed.projectId, input(1), { now }), "FORBIDDEN");
    await rejectsWith(updateDeveloperRating(otherClient, seed.projectId, input(1), { now }), "NOT_FOUND");
    expect((await ratingRows(seed.projectId))[0].rating).toBe(5);
  });
});

describe("getProjectRatingView", () => {
  it("without rating: canCreate true, rating null, previewName abbreviated, exact keys", async () => {
    const seed = await seedProject();
    const view = await getProjectRatingView(client, seed.projectId);
    expect(view).toEqual({
      project: { id: seed.projectId, title: "Landing page" },
      developerName: "Dana Developer",
      developerImageUrl: null,
      previewName: "Maria G.",
      rating: null,
      canCreate: true,
    });
    expect(Object.keys(view).sort()).toEqual([
      "canCreate",
      "developerImageUrl",
      "developerName",
      "previewName",
      "project",
      "rating",
    ]);
  });

  it("recent, edge and expired ratings", async () => {
    const seed = await seedProject();
    await createDeveloperRating(client, seed.projectId, input(4, "Nice"));
    const [row] = await ratingRows(seed.projectId);
    const at = (ms: number) => ({ now: () => new Date(row.createdAt.getTime() + ms) });

    const recent = await getProjectRatingView(client, seed.projectId, at(0));
    expect(recent.canCreate).toBe(false);
    expect(recent.rating).toEqual({ rating: 4, comment: "Nice", createdAt: row.createdAt, canEdit: true, daysLeft: 14 });
    expect(Object.keys(recent.rating!).sort()).toEqual(["canEdit", "comment", "createdAt", "daysLeft", "rating"]);

    const edge = await getProjectRatingView(client, seed.projectId, at(RATING_EDIT_WINDOW_MS - 1));
    expect(edge.rating).toMatchObject({ canEdit: true, daysLeft: 1 });

    const expired = await getProjectRatingView(client, seed.projectId, at(RATING_EDIT_WINDOW_MS));
    expect(expired.rating).toMatchObject({ canEdit: false, daysLeft: 0 });
  });

  it("does not leak ids of people or email", async () => {
    const seed = await seedProject();
    const json = JSON.stringify(await getProjectRatingView(client, seed.projectId));
    expect(json).not.toContain(seed.developerId);
    expect(json).not.toContain(client.id);
    expect(json).not.toContain("@example.com");
  });

  it("not contracted: NOT_FOUND; foreign client NOT_FOUND; developer and admin FORBIDDEN", async () => {
    const published = await seedProject({ status: "published" });
    await rejectsWith(getProjectRatingView(client, published.projectId), "NOT_FOUND");
    const seed = await seedProject();
    await rejectsWith(getProjectRatingView(otherClient, seed.projectId), "NOT_FOUND");
    await rejectsWith(getProjectRatingView(developer, seed.projectId), "FORBIDDEN");
    await rejectsWith(getProjectRatingView(admin, seed.projectId), "FORBIDDEN");
  });
});

/** Rates `n` fresh contracted projects of `dev`, one rating value each. */
async function rateAll(dev: AuthUser, values: number[], owner: AuthUser = client) {
  for (const value of values) {
    const seed = await seedProject({ dev, owner });
    await createDeveloperRating(owner, seed.projectId, input(value));
  }
}

describe("getDeveloperRatingSummary", () => {
  it("no ratings: { average: null, count: 0 }", async () => {
    const dev = await seedUser("developer");
    expect(await getDeveloperRatingSummary(dev.id)).toEqual({ average: null, count: 0 });
  });

  it.each([
    [[5], 5, 1],
    [[5, 4], 4.5, 2],
    [[1, 2], 1.5, 2],
    [[5, 4, 4], 4.3, 3],
  ])("ratings %j -> average %d, count %d", async (values, average, count) => {
    const dev = await seedUser("developer");
    await rateAll(dev, values);
    const summary: DeveloperRatingSummary = await getDeveloperRatingSummary(dev.id);
    expect(summary).toEqual({ average, count });
    expect(Object.keys(summary).sort()).toEqual(["average", "count"]);
  });

  it("counts only the requested developer and includes anonymized clients", async () => {
    const dev = await seedUser("developer");
    const otherDev = await seedUser("developer");
    const anonymized = await seedUser("client", "Deleted user");
    await rateAll(dev, [5]);
    await rateAll(dev, [3], anonymized);
    await rateAll(otherDev, [1]);
    expect(await getDeveloperRatingSummary(dev.id)).toEqual({ average: 4, count: 2 });
    expect(await getDeveloperRatingSummary(otherDev.id)).toEqual({ average: 1, count: 1 });
  });
});

describe("listDeveloperRatings", () => {
  it("only the requested developer, newest first, abbreviated names, exact keys", async () => {
    const dev = await seedUser("developer");
    const otherDev = await seedUser("developer");
    const emailLike = await seedUser("client", "maria.gomez@example.com");
    const anonymized = await seedUser("client", "Deleted user");
    await rateAll(dev, [5], client);
    await rateAll(dev, [4], emailLike);
    await rateAll(dev, [3], anonymized);
    await rateAll(otherDev, [1], client);

    const list = await listDeveloperRatings(dev.id);
    expect(list).toHaveLength(3);
    for (const item of list) expect(Object.keys(item).sort()).toEqual(["clientName", "comment", "createdAt", "rating"]);
    expect(list.map((r) => r.clientName).sort()).toEqual(["Cliente", "Cliente", "Maria G."]);
    expect(JSON.stringify(list)).not.toContain("@example.com");
  });

  it("limits to 20 (default and maximum) and honors a smaller limit", async () => {
    const dev = await seedUser("developer");
    await rateAll(dev, Array.from({ length: 22 }, () => 4));
    expect(await listDeveloperRatings(dev.id)).toHaveLength(20);
    expect(await listDeveloperRatings(dev.id, { limit: 100 })).toHaveLength(20);
    expect(await listDeveloperRatings(dev.id, { limit: 5 })).toHaveLength(5);
  });

  it("orders by created_at DESC", async () => {
    const dev = await seedUser("developer");
    await rateAll(dev, [1, 2, 3]);
    const all = await ctx.db
      .select({ id: developerRatings.id, rating: developerRatings.rating, proposalId: developerRatings.proposalId })
      .from(developerRatings)
      .innerJoin(proposals, eq(proposals.id, developerRatings.proposalId))
      .where(eq(proposals.developerId, dev.id));
    const base = Date.UTC(2026, 0, 1);
    for (const r of all) {
      await ctx.db
        .update(developerRatings)
        .set({ createdAt: new Date(base + r.rating * 86_400_000) })
        .where(eq(developerRatings.id, r.id));
    }
    expect((await listDeveloperRatings(dev.id)).map((r) => r.rating)).toEqual([3, 2, 1]);
  });

  it("developer with no ratings: empty list", async () => {
    const dev = await seedUser("developer");
    expect(await listDeveloperRatings(dev.id)).toEqual([]);
  });
});
