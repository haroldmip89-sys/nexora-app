// @vitest-environment node
// NOTE: PGlite is single-connection and serializes statements: the simultaneous case proves a
// coherent final state (UNIQUE + ON CONFLICT + idempotency key), not real locking under Neon.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/test-db";

vi.mock("server-only", () => ({}));

const holder = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy({}, { get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop] }),
}));

type AccountLike = Record<string, unknown>;

function userEntry() {
  return { awaiting_action_from: "user", minimum_deadline: { status: "currently_due" } };
}
function transfers(status: string) {
  return {
    configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status } } } } },
  };
}
const stripeState = vi.hoisted(() => ({
  seq: 0,
  byKey: new Map<string, AccountLike>(),
  accounts: new Map<string, AccountLike>(),
  createCalls: [] as { params: Record<string, unknown>; options: { idempotencyKey?: string } }[],
  retrieveCalls: [] as string[],
  retrieveParams: [] as unknown[],
  linkCalls: [] as Record<string, unknown>[],
  createError: null as unknown,
  createOverride: null as AccountLike | null,
  onCreate: null as null | (() => Promise<void>),
  retrieveError: null as unknown,
  retrieveOverride: null as AccountLike | null,
  linkError: null as unknown,
  linkUrl: "https://connect.stripe.com/setup/e/test_link" as string | null,
  configError: null as unknown,
}));
vi.mock("@/lib/stripe", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/stripe")>();
  const client = {
    v2: { core: {
    accounts: {
      create: async (
        params: Record<string, unknown>,
        options: { idempotencyKey?: string },
      ) => {
        stripeState.createCalls.push({ params, options });
        if (stripeState.createError) throw stripeState.createError;
        if (stripeState.onCreate) await stripeState.onCreate();
        if (stripeState.createOverride) return stripeState.createOverride;
        const key = options.idempotencyKey ?? "";
        const existing = stripeState.byKey.get(key);
        if (existing) return existing;
        const account: AccountLike = {
          id: `acct_test_${++stripeState.seq}`,
          livemode: false,
          ...transfers("pending"),
          requirements: { entries: [userEntry()] },
          metadata: (params as { metadata?: unknown }).metadata,
        };
        stripeState.byKey.set(key, account);
        stripeState.accounts.set(account.id as string, account);
        return account;
      },
      retrieve: async (id: string, params?: unknown) => {
        stripeState.retrieveCalls.push(id);
        stripeState.retrieveParams.push(params);
        if (stripeState.retrieveError) throw stripeState.retrieveError;
        if (stripeState.retrieveOverride) return stripeState.retrieveOverride;
        return stripeState.accounts.get(id);
      },
    },
    accountLinks: {
      create: async (params: Record<string, unknown>) => {
        stripeState.linkCalls.push(params);
        if (stripeState.linkError) throw stripeState.linkError;
        return { object: "v2.core.account_link", url: stripeState.linkUrl };
      },
    },
    } },
  };
  return {
    ...original,
    getStripe: () => {
      if (stripeState.configError) throw stripeState.configError;
      return client;
    },
  };
});

import { StripeConfigError } from "@/lib/stripe";
import { AuthError } from "@/modules/auth/services/auth-errors";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { connectedAccounts } from "@/modules/payments/schema/connected-accounts.table";
import { users } from "@/modules/users/schema/users.table";
import { ConnectedAccountError } from "./connected-account-errors";
import {
  CONNECTED_ACCOUNT_COUNTRY,
  CONNECTED_ACCOUNT_CURRENCY,
  ensureConnectedAccount,
  getConnectedAccountOverview,
  startOnboarding,
  syncConnectedAccount,
  syncConnectedAccountForUser,
} from "./connected-account.service";

type Ctx = Awaited<ReturnType<typeof createTestDb>>;
let ctx: Ctx;
let seq = 0;
let client: AuthUser;
let admin: AuthUser;
let consoleSpies: ReturnType<typeof vi.spyOn>[];

async function seedUser(role: AuthUser["role"]): Promise<AuthUser> {
  const n = ++seq;
  const [row] = await ctx.db
    .insert(users)
    .values({ clerkUserId: `clerk_ca_${n}`, role, displayName: `CA${n}`, email: `ca${n}@example.com` })
    .returning();
  return { id: row.id, clerkUserId: row.clerkUserId, role, displayName: row.displayName, email: row.email };
}

async function rowOf(user: AuthUser) {
  const [row] = await ctx.db.select().from(connectedAccounts).where(eq(connectedAccounts.userId, user.id));
  return row;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ConnectedAccountError);
  expect((err as ConnectedAccountError).code).toBe(code);
}

function loggedText(): string {
  return consoleSpies
    .flatMap((spy) => spy.mock.calls)
    .map((args) => JSON.stringify(args))
    .join("\n");
}

function stripeError(type: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error("boom acct_secret https://connect.stripe.com/x"), {
    type,
    code: "some_code",
    statusCode: 400,
    requestId: "req_test",
    ...extra,
  });
}

beforeAll(async () => {
  ctx = await createTestDb();
  holder.db = ctx.db;
  client = await seedUser("client");
  admin = await seedUser("admin");
});
afterAll(async () => {
  await ctx.client.close();
});
beforeEach(() => {
  stripeState.byKey.clear();
  stripeState.accounts.clear();
  stripeState.createCalls.length = 0;
  stripeState.retrieveCalls.length = 0;
  stripeState.retrieveParams.length = 0;
  stripeState.linkCalls.length = 0;
  stripeState.createError = null;
  stripeState.createOverride = null;
  stripeState.onCreate = null;
  stripeState.retrieveError = null;
  stripeState.retrieveOverride = null;
  stripeState.linkError = null;
  stripeState.linkUrl = "https://connect.stripe.com/setup/e/test_link";
  stripeState.configError = null;
  holder.db = ctx.db;
  vi.restoreAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  consoleSpies = [
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "info").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
  ];
});

describe("ensureConnectedAccount", () => {
  it("creates one row and one Stripe account when called twice", async () => {
    const dev = await seedUser("developer");
    const first = await ensureConnectedAccount(dev);
    const second = await ensureConnectedAccount(dev);

    expect(stripeState.createCalls).toHaveLength(1);
    expect(second.stripeAccountId).toBe(first.stripeAccountId);
    const rows = await ctx.db.select().from(connectedAccounts).where(eq(connectedAccounts.userId, dev.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].stripeAccountId).toBe(first.stripeAccountId);
    expect(rows[0].status).toBe("not_started");
    expect(rows[0].statusSyncedAt).toBeInstanceOf(Date);
  });

  it("sends exactly the spec parameters and a deterministic idempotency key", async () => {
    const dev = await seedUser("developer");
    const { rowId } = await ensureConnectedAccount(dev);
    const [call] = stripeState.createCalls;
    expect(call.options).toEqual({ idempotencyKey: `nexora:connect-account-v2:${rowId}` });
    expect(call.params).toEqual({
      contact_email: dev.email,
      identity: { country: CONNECTED_ACCOUNT_COUNTRY },
      dashboard: "express",
      defaults: {
        currency: CONNECTED_ACCOUNT_CURRENCY,
        responsibilities: { fees_collector: "application", losses_collector: "application" },
      },
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      },
      include: ["configuration.recipient", "requirements"],
      metadata: { nexora_user_id: dev.id },
    });
    expect(CONNECTED_ACCOUNT_COUNTRY).toBe("us");
    expect(call.params).not.toHaveProperty("controller");
    expect(call.params).not.toHaveProperty("capabilities");
    expect(call.params).not.toHaveProperty("country");
    expect(call.params).not.toHaveProperty("type");
    expect(call.params).not.toHaveProperty("email");
    expect(call.params).not.toHaveProperty("display_name");
    expect(JSON.stringify(call.params)).not.toContain("card_payments");
  });

  it("simultaneous calls end with one row, one account and the same key and params", async () => {
    const dev = await seedUser("developer");
    const results = await Promise.allSettled([ensureConnectedAccount(dev), ensureConnectedAccount(dev)]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);

    const rows = await ctx.db.select().from(connectedAccounts).where(eq(connectedAccounts.userId, dev.id));
    expect(rows).toHaveLength(1);
    expect(stripeState.accounts.size).toBe(1);
    const keys = new Set(stripeState.createCalls.map((c) => c.options.idempotencyKey));
    expect(keys).toEqual(new Set([`nexora:connect-account-v2:${rows[0].id}`]));
    const params = new Set(stripeState.createCalls.map((c) => JSON.stringify(c.params)));
    expect(params.size).toBe(1);
    const [a, b] = results as PromiseFulfilledResult<{ stripeAccountId: string }>[];
    expect(a.value.stripeAccountId).toBe(b.value.stripeAccountId);
    expect(rows[0].stripeAccountId).toBe(a.value.stripeAccountId);
  });

  it("ambiguous failure leaves the row without account and the retry reuses the same key", async () => {
    const dev = await seedUser("developer");
    stripeState.createError = stripeError("StripeConnectionError");
    await expectCode(ensureConnectedAccount(dev), "STRIPE_UNAVAILABLE");
    const row = await rowOf(dev);
    expect(row.stripeAccountId).toBeNull();
    expect(row.status).toBe("not_started");

    stripeState.createError = null;
    await ensureConnectedAccount(dev);
    const keys = stripeState.createCalls.map((c) => c.options.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it.each(["StripeAPIError", "StripeRateLimitError", "StripeIdempotencyError"])(
    "%s is ambiguous (STRIPE_UNAVAILABLE)",
    async (type) => {
      const dev = await seedUser("developer");
      stripeState.createError = stripeError(type);
      await expectCode(ensureConnectedAccount(dev), "STRIPE_UNAVAILABLE");
    },
  );

  it.each(["StripeInvalidRequestError", "StripeAuthenticationError", "StripePermissionError"])(
    "%s is a definitive rejection (STRIPE_NOT_CONFIGURED) without account",
    async (type) => {
      const dev = await seedUser("developer");
      stripeState.createError = stripeError(type);
      await expectCode(ensureConnectedAccount(dev), "STRIPE_NOT_CONFIGURED");
      expect((await rowOf(dev)).stripeAccountId).toBeNull();
    },
  );

  it("returns the stored account and logs the anomaly (without Stripe ids) when phase C loses the race", async () => {
    const dev = await seedUser("developer");
    stripeState.onCreate = async () => {
      await ctx.db
        .update(connectedAccounts)
        .set({ stripeAccountId: "acct_stored_other" })
        .where(eq(connectedAccounts.userId, dev.id));
    };
    const result = await ensureConnectedAccount(dev);
    expect(result.stripeAccountId).toBe("acct_stored_other");
    expect((await rowOf(dev)).stripeAccountId).toBe("acct_stored_other");
    expect(loggedText()).toContain("race lost");
    expect(loggedText()).not.toContain("acct_");
  });

  it.each([{ id: "cus_wrong" }, {}, { id: undefined }])(
    "a response without an acct_ id gives STRIPE_UNAVAILABLE (%j)",
    async (override) => {
      const dev = await seedUser("developer");
      stripeState.createOverride = override;
      await expectCode(ensureConnectedAccount(dev), "STRIPE_UNAVAILABLE");
      expect((await rowOf(dev)).stripeAccountId).toBeNull();
    },
  );

  it("derives the stored status from the created account", async () => {
    const dev = await seedUser("developer");
    stripeState.createOverride = {
      id: "acct_override_1",
      ...transfers("active"),
    };
    const result = await ensureConnectedAccount(dev);
    expect(result.status).toBe("active");
    expect((await rowOf(dev)).status).toBe("active");
  });
});

describe("authorization", () => {
  it.each([
    ["client", () => client],
    ["admin", () => admin],
  ])("%s gets FORBIDDEN in every service without touching the DB or Stripe", async (_role, who) => {
    holder.db = new Proxy({}, {
      get: () => {
        throw new Error("DB must not be touched");
      },
    });
    const actor = who();
    const calls = [
      () => ensureConnectedAccount(actor),
      () => startOnboarding(actor),
      () => syncConnectedAccount(actor),
      () => getConnectedAccountOverview(actor),
    ];
    for (const call of calls) {
      const err = await call().then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe("FORBIDDEN");
    }
    expect(stripeState.createCalls).toHaveLength(0);
    expect(stripeState.retrieveCalls).toHaveLength(0);
    expect(stripeState.linkCalls).toHaveLength(0);
  });

  it("two developers only see and sync their own row", async () => {
    const a = await seedUser("developer");
    const b = await seedUser("developer");
    const accountA = await ensureConnectedAccount(a);
    expect((await getConnectedAccountOverview(b)).hasStripeAccount).toBe(false);
    expect((await syncConnectedAccount(b)).status).toBe("not_started");
    expect(stripeState.retrieveCalls).toHaveLength(0);

    const accountB = await ensureConnectedAccount(b);
    expect(accountB.stripeAccountId).not.toBe(accountA.stripeAccountId);
    await syncConnectedAccount(b);
    expect(stripeState.retrieveCalls).toEqual([accountB.stripeAccountId]);
  });
});

describe("live or missing Stripe key", () => {
  beforeEach(() => {
    stripeState.configError = new StripeConfigError(
      "STRIPE_SECRET_KEY is a live key; only Stripe test keys (sk_test_...) are accepted.",
    );
  });

  it("ensure, startOnboarding and sync give STRIPE_NOT_CONFIGURED without writing", async () => {
    const dev = await seedUser("developer");
    await expectCode(ensureConnectedAccount(dev), "STRIPE_NOT_CONFIGURED");
    await expectCode(startOnboarding(dev), "STRIPE_NOT_CONFIGURED");
    await expectCode(syncConnectedAccount(dev), "STRIPE_NOT_CONFIGURED");
    expect(await rowOf(dev)).toBeUndefined();
    expect(stripeState.createCalls).toHaveLength(0);
    expect(loggedText()).not.toContain("sk_live_");
  });
});

describe("startOnboarding", () => {
  it("creates the link with the expected parameters and returns only the URL", async () => {
    const dev = await seedUser("developer");
    const { onboardingUrl } = await startOnboarding(dev);
    expect(onboardingUrl).toBe("https://connect.stripe.com/setup/e/test_link");
    const row = await rowOf(dev);
    expect(stripeState.linkCalls).toEqual([
      {
        account: row.stripeAccountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            refresh_url: "http://localhost:3000/dashboard/payouts/onboarding/refresh",
            return_url: "http://localhost:3000/dashboard/payouts/onboarding/return",
            collection_options: { fields: "currently_due" },
          },
        },
      },
    ]);
    expect(JSON.stringify(row)).not.toContain("stripe.com");
    expect(loggedText()).not.toContain("stripe.com");
  });

  it("reuses the same account across calls (one create)", async () => {
    const dev = await seedUser("developer");
    await startOnboarding(dev);
    await startOnboarding(dev);
    expect(stripeState.createCalls).toHaveLength(1);
    expect(stripeState.linkCalls).toHaveLength(2);
  });

  it.each(["http://connect.stripe.com/x", "https://stripe.com.evil.io/x", "not a url", "", null])(
    "rejects a URL not hosted by Stripe (%j)",
    async (url) => {
      const dev = await seedUser("developer");
      stripeState.linkUrl = url;
      await expectCode(startOnboarding(dev), "STRIPE_UNAVAILABLE");
    },
  );

  it("active accounts give ACCOUNT_ALREADY_ACTIVE without calling accountLinks", async () => {
    const dev = await seedUser("developer");
    stripeState.createOverride = {
      id: "acct_override_2",
      ...transfers("active"),
    };
    await expectCode(startOnboarding(dev), "ACCOUNT_ALREADY_ACTIVE");
    expect(stripeState.linkCalls).toHaveLength(0);
  });

  it("a definitive rejection of accountLinks gives ACCOUNT_UNAVAILABLE", async () => {
    const dev = await seedUser("developer");
    stripeState.linkError = stripeError("StripeInvalidRequestError");
    await expectCode(startOnboarding(dev), "ACCOUNT_UNAVAILABLE");
    expect(loggedText()).not.toContain("acct_");
    expect(loggedText()).not.toContain("stripe.com");
  });

  it("an ambiguous accountLinks failure gives STRIPE_UNAVAILABLE", async () => {
    const dev = await seedUser("developer");
    stripeState.linkError = stripeError("StripeConnectionError");
    await expectCode(startOnboarding(dev), "STRIPE_UNAVAILABLE");
  });

  it("a missing APP_URL gives STRIPE_NOT_CONFIGURED without creating a link", async () => {
    const dev = await seedUser("developer");
    vi.stubEnv("APP_URL", "");
    await expectCode(startOnboarding(dev), "STRIPE_NOT_CONFIGURED");
    expect(stripeState.linkCalls).toHaveLength(0);
  });
});

describe("syncConnectedAccount", () => {
  it("without row or account returns not_started without calling Stripe", async () => {
    const dev = await seedUser("developer");
    expect(await syncConnectedAccount(dev)).toEqual({ status: "not_started" });
    expect(await rowOf(dev)).toBeUndefined();
    await ctx.db.insert(connectedAccounts).values({ userId: dev.id });
    expect(await syncConnectedAccount(dev)).toEqual({ status: "not_started" });
    expect(stripeState.retrieveCalls).toHaveLength(0);
  });

  const cases: [string, AccountLike, string][] = [
    ["not_started", { ...transfers("pending"), requirements: { entries: [userEntry()] } }, "not_started"],
    [
      "pending",
      { ...transfers("pending"), requirements: { entries: [{ awaiting_action_from: "stripe" }] } },
      "pending",
    ],
    ["restricted", { ...transfers("restricted"), requirements: { entries: [] } }, "restricted"],
    ["active", { ...transfers("active"), requirements: { entries: [userEntry()] } }, "active"],
  ];
  it.each(cases)("updates status to %s and rereading is idempotent", async (_n, patch, expected) => {
    const dev = await seedUser("developer");
    const { stripeAccountId } = await ensureConnectedAccount(dev);
    Object.assign(stripeState.accounts.get(stripeAccountId)!, patch);

    expect(await syncConnectedAccount(dev)).toEqual({ status: expected });
    const first = await rowOf(dev);
    expect(first.status).toBe(expected);
    expect(first.statusSyncedAt).toBeInstanceOf(Date);
    expect(await syncConnectedAccount(dev)).toEqual({ status: expected });
    expect((await rowOf(dev)).status).toBe(expected);
  });

  it("retrieves with the mandatory include", async () => {
    const dev = await seedUser("developer");
    await ensureConnectedAccount(dev);
    await syncConnectedAccount(dev);
    expect(stripeState.retrieveParams).toEqual([
      { include: ["configuration.recipient", "requirements"] },
    ]);
  });

  it("allows any transition (active back to restricted)", async () => {
    const dev = await seedUser("developer");
    const { stripeAccountId } = await ensureConnectedAccount(dev);
    const account = stripeState.accounts.get(stripeAccountId)!;
    Object.assign(account, transfers("active"));
    await syncConnectedAccount(dev);
    Object.assign(account, transfers("restricted"));
    expect(await syncConnectedAccount(dev)).toEqual({ status: "restricted" });
  });

  it("livemode true gives ACCOUNT_UNAVAILABLE without writing", async () => {
    const dev = await seedUser("developer");
    const { stripeAccountId } = await ensureConnectedAccount(dev);
    const before = await rowOf(dev);
    stripeState.retrieveOverride = { id: stripeAccountId, livemode: true, ...transfers("active") };
    await expectCode(syncConnectedAccount(dev), "ACCOUNT_UNAVAILABLE");
    expect(await rowOf(dev)).toEqual(before);
    expect(loggedText()).not.toContain("acct_");
  });

  it("a definitive rejection gives ACCOUNT_UNAVAILABLE without writing", async () => {
    const dev = await seedUser("developer");
    await ensureConnectedAccount(dev);
    const before = await rowOf(dev);
    stripeState.retrieveError = stripeError("StripePermissionError");
    await expectCode(syncConnectedAccount(dev), "ACCOUNT_UNAVAILABLE");
    expect(await rowOf(dev)).toEqual(before);
  });

  it("an ambiguous error gives STRIPE_UNAVAILABLE without writing", async () => {
    const dev = await seedUser("developer");
    await ensureConnectedAccount(dev);
    const before = await rowOf(dev);
    stripeState.retrieveError = stripeError("StripeAPIError");
    await expectCode(syncConnectedAccount(dev), "STRIPE_UNAVAILABLE");
    expect(await rowOf(dev)).toEqual(before);
  });

  it("a different metadata.nexora_user_id gives ACCOUNT_UNAVAILABLE without writing", async () => {
    const dev = await seedUser("developer");
    const { stripeAccountId } = await ensureConnectedAccount(dev);
    const before = await rowOf(dev);
    stripeState.retrieveOverride = {
      id: stripeAccountId,
      ...transfers("active"),
      metadata: { nexora_user_id: "someone-else" },
    };
    await expectCode(syncConnectedAccount(dev), "ACCOUNT_UNAVAILABLE");
    expect(await rowOf(dev)).toEqual(before);
    expect(loggedText()).not.toContain("acct_");
  });

  it("a different account id gives ACCOUNT_UNAVAILABLE without writing", async () => {
    const dev = await seedUser("developer");
    await ensureConnectedAccount(dev);
    const before = await rowOf(dev);
    stripeState.retrieveOverride = { id: "acct_other", ...transfers("active") };
    await expectCode(syncConnectedAccount(dev), "ACCOUNT_UNAVAILABLE");
    expect(await rowOf(dev)).toEqual(before);
  });
});

describe("syncConnectedAccountForUser", () => {
  it("without account returns not_started and no acct_ without calling Stripe", async () => {
    const dev = await seedUser("developer");
    expect(await syncConnectedAccountForUser(dev.id)).toEqual({
      status: "not_started",
      stripeAccountId: null,
    });
    expect(stripeState.retrieveCalls).toHaveLength(0);
  });

  it("refreshes the cached status and returns the stored account id; the actor wrapper only returns the status", async () => {
    const dev = await seedUser("developer");
    const { stripeAccountId } = await ensureConnectedAccount(dev);
    Object.assign(stripeState.accounts.get(stripeAccountId)!, transfers("active"));

    expect(await syncConnectedAccountForUser(dev.id)).toEqual({ status: "active", stripeAccountId });
    expect((await rowOf(dev)).status).toBe("active");
    expect(await syncConnectedAccount(dev)).toEqual({ status: "active" });
  });

  it("keeps the same defenses and error codes (owner mismatch, live, Stripe errors, config)", async () => {
    const dev = await seedUser("developer");
    const { stripeAccountId } = await ensureConnectedAccount(dev);
    stripeState.retrieveOverride = {
      id: stripeAccountId,
      ...transfers("active"),
      metadata: { nexora_user_id: "someone-else" },
    };
    await expectCode(syncConnectedAccountForUser(dev.id), "ACCOUNT_UNAVAILABLE");
    stripeState.retrieveOverride = { id: stripeAccountId, livemode: true, ...transfers("active") };
    await expectCode(syncConnectedAccountForUser(dev.id), "ACCOUNT_UNAVAILABLE");
    stripeState.retrieveOverride = null;
    stripeState.retrieveError = stripeError("StripeAPIError");
    await expectCode(syncConnectedAccountForUser(dev.id), "STRIPE_UNAVAILABLE");
    stripeState.retrieveError = null;
    stripeState.configError = new StripeConfigError("STRIPE_SECRET_KEY is missing.");
    await expectCode(syncConnectedAccountForUser(dev.id), "STRIPE_NOT_CONFIGURED");
    expect((await rowOf(dev)).status).toBe("not_started");
  });
});

describe("getConnectedAccountOverview", () => {
  it("without a row returns not_started", async () => {
    const dev = await seedUser("developer");
    expect(await getConnectedAccountOverview(dev)).toEqual({
      status: "not_started",
      hasStripeAccount: false,
      statusSyncedAt: null,
    });
  });

  it("returns exactly status, hasStripeAccount and statusSyncedAt without calling Stripe", async () => {
    const dev = await seedUser("developer");
    const { stripeAccountId } = await ensureConnectedAccount(dev);
    stripeState.createCalls.length = 0;
    const overview = await getConnectedAccountOverview(dev);
    expect(Object.keys(overview).sort()).toEqual(["hasStripeAccount", "status", "statusSyncedAt"]);
    expect(overview.hasStripeAccount).toBe(true);
    expect(JSON.stringify(overview)).not.toContain(stripeAccountId);
    expect(stripeState.createCalls).toHaveLength(0);
    expect(stripeState.retrieveCalls).toHaveLength(0);
    expect(stripeState.linkCalls).toHaveLength(0);
  });
});

describe("logs", () => {
  it("logs the sanitized Stripe message of a 400 on account create", async () => {
    const dev = await seedUser("developer");
    stripeState.createError = stripeError("StripeInvalidRequestError", {
      message: "Invalid identity.country for acct_123 see https://stripe.com/docs a@b.com",
    });
    await expectCode(ensureConnectedAccount(dev), "STRIPE_NOT_CONFIGURED");
    const text = loggedText();
    expect(text).toContain("Invalid identity.country for [redacted]");
    expect(text).not.toContain("acct_");
    expect(text).not.toContain("stripe.com");
    expect(text).not.toContain("a@b.com");
  });

  it("never print account ids, link URLs, emails or keys across the flows", async () => {
    const dev = await seedUser("developer");
    await startOnboarding(dev);
    await syncConnectedAccount(dev);
    stripeState.retrieveError = stripeError("StripeAPIError");
    await syncConnectedAccount(dev).catch(() => {});
    stripeState.linkError = stripeError("StripeInvalidRequestError");
    await startOnboarding(dev).catch(() => {});

    const text = loggedText();
    expect(text).not.toContain("acct_");
    expect(text).not.toContain("stripe.com");
    expect(text).not.toContain(dev.email);
    expect(text).not.toContain("sk_");
  });
});
