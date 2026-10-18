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
import type { DeveloperProfileInput } from "@/modules/profile/schemas/developer-profile.schema";
import { proposals } from "@/modules/proposals/schema/proposals.table";
import { developerProfiles } from "@/modules/users/schema/developer-profiles.table";
import { users } from "@/modules/users/schema/users.table";
import { DELETED_EMAIL_DOMAIN } from "@/modules/users/services/users.service";
import { getOwnProfile, getPublicDeveloperProfile, saveOwnProfile } from "./developer-profile.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;
const ACCESS_EMAIL = "access-secret@example.com";
const CONTACT_EMAIL = "contact-public@example.com";

async function seedUser(role: AuthUser["role"], displayName?: string): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({
      clerkUserId: `clerk_p_${n}`,
      role,
      displayName: displayName ?? `User ${n}`,
      email: role === "developer" ? `${n}-${ACCESS_EMAIL}` : `p${n}@example.com`,
    })
    .returning();
  return { id: row.id, clerkUserId: row.clerkUserId, role, displayName: row.displayName, email: row.email };
}

const input = (over: Partial<DeveloperProfileInput> = {}): DeveloperProfileInput => ({
  headline: "Full stack dev",
  location: "Lima",
  availability: "partial",
  bio: "Bio text",
  links: [{ type: "github", url: "https://github.com/ada" }],
  contactEmail: CONTACT_EMAIL,
  contactVisibility: "accepted_client",
  ...over,
});

async function seedProposal(client: AuthUser, developer: AuthUser, status: "accepted" | "pending" | "rejected" | "withdrawn") {
  const [project] = await ctx.db
    .insert(projects)
    .values({
      clientId: client.id,
      title: "Landing page",
      category: "Frontend & UI/UX",
      description: "We need a modern landing page for our bakery.",
      budgetMinCents: 100_000,
      budgetMaxCents: 200_000,
      timelineWeeks: 4,
      status: "published",
      publishedAt: new Date(),
    })
    .returning();
  await ctx.db
    .insert(proposals)
    .values({ projectId: project.id, developerId: developer.id, priceCents: 150_000, timelineWeeks: 3, description: "d", status });
}

async function rejectsWith(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AuthError);
  expect((err as { code: string }).code).toBe(code);
}

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
});
afterAll(async () => {
  await ctx.client.close();
});

describe("getOwnProfile / saveOwnProfile", () => {
  it("client and admin get FORBIDDEN without touching the DB", async () => {
    const client = await seedUser("client");
    const admin = await seedUser("admin");
    for (const actor of [client, admin]) {
      await rejectsWith(getOwnProfile(actor), "FORBIDDEN");
      await rejectsWith(saveOwnProfile(actor, input()), "FORBIDDEN");
    }
    expect(await ctx.db.select().from(developerProfiles).where(eq(developerProfiles.userId, client.id))).toEqual([]);
  });

  it("without a row returns defaults with hasProfile false and does not insert", async () => {
    const dev = await seedUser("developer", "Ada Lovelace");
    expect(await getOwnProfile(dev)).toEqual({
      displayName: "Ada Lovelace",
      headline: "",
      location: "",
      availability: "available",
      bio: "",
      links: [],
      contactEmail: "",
      contactVisibility: "accepted_client",
      hasProfile: false,
    });
    expect(await ctx.db.select().from(developerProfiles).where(eq(developerProfiles.userId, dev.id))).toEqual([]);
  });

  it("saves and reads back; null location/email read as empty strings; never exposes users.email", async () => {
    const dev = await seedUser("developer");
    await saveOwnProfile(dev, input({ location: null, contactEmail: null }));
    const own = await getOwnProfile(dev);
    expect(own).toMatchObject({ hasProfile: true, headline: "Full stack dev", location: "", contactEmail: "", availability: "partial" });
    expect(JSON.stringify(own)).not.toContain(ACCESS_EMAIL);
    expect(Object.keys(own)).not.toContain("email");
  });

  it("saving twice (sequential and parallel) leaves a single row; last write wins", async () => {
    const dev = await seedUser("developer");
    await saveOwnProfile(dev, input({ headline: "First" }));
    await saveOwnProfile(dev, input({ headline: "Second" }));
    await Promise.all([saveOwnProfile(dev, input({ headline: "A" })), saveOwnProfile(dev, input({ headline: "A" }))]);
    const rows = await ctx.db.select().from(developerProfiles).where(eq(developerProfiles.userId, dev.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].headline).toBe("A");
  });

  it("does not modify technologies or external_url", async () => {
    const dev = await seedUser("developer");
    await ctx.db
      .insert(developerProfiles)
      .values({ userId: dev.id, headline: "old", bio: "", technologies: ["nodejs"], externalUrl: "https://old.example.com" });
    await saveOwnProfile(dev, input());
    const [row] = await ctx.db.select().from(developerProfiles).where(eq(developerProfiles.userId, dev.id));
    expect(row.technologies).toEqual(["nodejs"]);
    expect(row.externalUrl).toBe("https://old.example.com");
    expect(row.headline).toBe("Full stack dev");
  });

  it("isolates two developers", async () => {
    const a = await seedUser("developer");
    const b = await seedUser("developer");
    await saveOwnProfile(a, input({ headline: "Dev A" }));
    await saveOwnProfile(b, input({ headline: "Dev B" }));
    expect((await getOwnProfile(a)).headline).toBe("Dev A");
    expect((await getOwnProfile(b)).headline).toBe("Dev B");
  });
});

describe("getPublicDeveloperProfile", () => {
  it("returns null for invalid, unknown, client and admin ids", async () => {
    const client = await seedUser("client");
    const admin = await seedUser("admin");
    expect(await getPublicDeveloperProfile("not-a-uuid", null)).toBeNull();
    expect(await getPublicDeveloperProfile("00000000-0000-4000-8000-000000000000", null)).toBeNull();
    expect(await getPublicDeveloperProfile(client.id, null)).toBeNull();
    expect(await getPublicDeveloperProfile(admin.id, null)).toBeNull();
  });

  it("without a profile row returns hasProfile false and empty fields", async () => {
    const dev = await seedUser("developer", "Lucía Ramos");
    expect(await getPublicDeveloperProfile(dev.id, null)).toEqual({
      userId: dev.id,
      displayName: "Lucía Ramos",
      initials: "LR",
      hasProfile: false,
      headline: null,
      location: null,
      availability: null,
      bio: null,
      links: [],
      contactEmail: null,
      contactState: "none",
    });
  });

  it("DTO has exact keys and never leaks the access email", async () => {
    const dev = await seedUser("developer");
    await saveOwnProfile(dev, input({ contactVisibility: "any_client" }));
    const pub = await getPublicDeveloperProfile(dev.id, null);
    expect(pub && Object.keys(pub).sort()).toEqual(
      [
        "userId", "displayName", "initials", "hasProfile", "headline", "location",
        "availability", "bio", "links", "contactEmail", "contactState",
      ].sort(),
    );
    expect(JSON.stringify(pub)).not.toContain(ACCESS_EMAIL);
    expect(pub?.contactEmail).toBeNull();
    expect(pub?.contactState).toBe("restricted");
  });

  it("accepted_client: visible only to the client owning a project with an accepted proposal", async () => {
    const dev = await seedUser("developer");
    const owner = await seedUser("client");
    const pendingClient = await seedUser("client");
    const rejectedClient = await seedUser("client");
    const withdrawnClient = await seedUser("client");
    const unrelated = await seedUser("client");
    await saveOwnProfile(dev, input());
    await seedProposal(owner, dev, "accepted");
    await seedProposal(pendingClient, dev, "pending");
    await seedProposal(rejectedClient, dev, "rejected");
    await seedProposal(withdrawnClient, dev, "withdrawn");

    const view = (c: AuthUser) => getPublicDeveloperProfile(dev.id, { id: c.id, role: c.role });
    expect(await view(owner)).toMatchObject({ contactEmail: CONTACT_EMAIL, contactState: "visible" });
    for (const c of [pendingClient, rejectedClient, withdrawnClient, unrelated]) {
      expect(await view(c)).toMatchObject({ contactEmail: null, contactState: "restricted" });
    }
    expect(await getPublicDeveloperProfile(dev.id, null)).toMatchObject({ contactEmail: null, contactState: "restricted" });
    expect(await getPublicDeveloperProfile(dev.id, { id: dev.id, role: "developer" })).toMatchObject({
      contactEmail: CONTACT_EMAIL,
      contactState: "visible",
    });
  });

  it("any_client and nobody", async () => {
    const dev = await seedUser("developer");
    const client = await seedUser("client");
    const otherDev = await seedUser("developer");
    const admin = await seedUser("admin");
    await saveOwnProfile(dev, input({ contactVisibility: "any_client" }));
    expect(await getPublicDeveloperProfile(dev.id, { id: client.id, role: "client" })).toMatchObject({ contactEmail: CONTACT_EMAIL });
    expect(await getPublicDeveloperProfile(dev.id, { id: otherDev.id, role: "developer" })).toMatchObject({ contactEmail: null });
    expect(await getPublicDeveloperProfile(dev.id, { id: admin.id, role: "admin" })).toMatchObject({ contactEmail: null });

    await saveOwnProfile(dev, input({ contactVisibility: "nobody" }));
    expect(await getPublicDeveloperProfile(dev.id, { id: client.id, role: "client" })).toMatchObject({
      contactEmail: null,
      contactState: "hidden_by_owner",
    });
  });

  it("anonymized developer hides the contact email even for the accepted client", async () => {
    const dev = await seedUser("developer", "Deleted user");
    const owner = await seedUser("client");
    await saveOwnProfile(dev, input({ contactVisibility: "any_client" }));
    await seedProposal(owner, dev, "accepted");
    await ctx.db
      .update(users)
      .set({ email: `${dev.id}${DELETED_EMAIL_DOMAIN}` })
      .where(eq(users.id, dev.id));
    const pub = await getPublicDeveloperProfile(dev.id, { id: owner.id, role: "client" });
    expect(pub).toMatchObject({ contactEmail: null, contactState: "none", initials: "DU", hasProfile: true });
    expect(JSON.stringify(pub)).not.toContain(CONTACT_EMAIL);
  });
});
