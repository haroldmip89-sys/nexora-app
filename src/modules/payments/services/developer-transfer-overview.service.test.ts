// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

import { AuthError } from "@/modules/auth/services/auth-errors";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { projects } from "@/modules/projects/schema/projects.table";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { users } from "@/modules/users/schema/users.table";
import { getDeveloperTransfers } from "./developer-transfer-overview.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;
let client: AuthUser;
let admin: AuthUser;
let devA: AuthUser;
let devB: AuthUser;

async function seedUser(role: AuthUser["role"]): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_t_${n}`, role, displayName: `User ${n}`, email: `t${n}@example.com` })
    .returning();
  return { id: row.id, clerkUserId: row.clerkUserId, role, displayName: row.displayName, email: row.email };
}

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  client = await seedUser("client");
  admin = await seedUser("admin");
  devA = await seedUser("developer");
  devB = await seedUser("developer");
});
afterAll(async () => {
  await ctx.client.close();
});

async function seedTransfer(
  developer: AuthUser,
  title: string,
  values: { status: "pending" | "completed_test" | "failed"; reason?: string },
) {
  const [project] = await ctx.db
    .insert(projects)
    .values({
      clientId: client.id,
      title,
      category: "Frontend & UI/UX",
      description: "We need a modern landing page for our bakery.",
      budgetMinCents: 100_000,
      budgetMaxCents: 200_000,
      timelineWeeks: 4,
      status: "contracted",
      publishedAt: new Date(),
    })
    .returning();
  const [proposal] = await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: developer.id, priceCents: 150_000, timelineWeeks: 3, description: "d", status: "accepted" })
    .returning();
  await ctx.db.insert(proposalSelections).values({ projectId: project.id, proposalId: proposal.id, selectedBy: client.id });
  const [attempt] = await ctx.db
    .insert(paymentAttempts)
    .values({
      projectId: project.id,
      proposalId: proposal.id,
      clientId: client.id,
      amountCents: 150_000,
      status: "completed_test",
      stripeCheckoutSessionId: `cs_test_${++seq}`,
      stripePaymentIntentId: `pi_test_${seq}`,
      completedAt: new Date(),
    })
    .returning();
  await ctx.db.insert(developerTransfers).values({
    paymentAttemptId: attempt.id,
    developerId: developer.id,
    amountCents: 150_000,
    status: values.status,
    lastErrorCode: values.reason ?? null,
    stripeTransferId: values.status === "completed_test" ? `tr_test_${seq}` : null,
    completedAt: values.status === "completed_test" ? new Date() : null,
  });
}

describe("getDeveloperTransfers", () => {
  it("returns only the actor's rows with the exact projection and no Stripe ids", async () => {
    await seedTransfer(devA, "Mine pending", { status: "pending", reason: "ACCOUNT_NOT_ACTIVE" });
    await seedTransfer(devA, "Mine done", { status: "completed_test" });
    await seedTransfer(devB, "Not mine", { status: "pending" });

    const items = await getDeveloperTransfers(devA);
    expect(items.map((i) => i.projectTitle).sort()).toEqual(["Mine done", "Mine pending"]);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual([
        "amountCents",
        "completedAt",
        "createdAt",
        "id",
        "projectTitle",
        "reason",
        "status",
      ]);
    }
    const pending = items.find((i) => i.projectTitle === "Mine pending")!;
    expect(pending).toMatchObject({ status: "pending", reason: "ACCOUNT_NOT_ACTIVE", amountCents: 150_000, completedAt: null });
    const json = JSON.stringify(items);
    expect(json).not.toContain("tr_test_");
    expect(json).not.toContain("pi_test_");
    expect(json).not.toContain("@example.com");
  });

  it("returns an empty list for a developer without transfers", async () => {
    const lonely = await seedUser("developer");
    expect(await getDeveloperTransfers(lonely)).toEqual([]);
  });

  it.each(["client", "admin"] as const)("%s gets FORBIDDEN", async (role) => {
    const err = await getDeveloperTransfers(role === "client" ? client : admin).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe("FORBIDDEN");
  });
});
