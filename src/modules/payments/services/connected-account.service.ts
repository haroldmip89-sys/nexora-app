import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db/client";
import {
  getAppUrl,
  getStripe,
  isDefinitiveStripeRejection,
  isStripeHostedUrl,
  StripeConfigError,
  stripeErrorLogFields,
} from "@/lib/stripe";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { connectedAccounts } from "@/modules/payments/schema/connected-accounts.table";
import { ConnectedAccountError } from "@/modules/payments/services/connected-account-errors";
import {
  deriveConnectedAccountStatus,
  toConnectedAccountSnapshot,
} from "@/modules/payments/services/connected-account-status";
import type {
  ConnectedAccountOverview,
  ConnectedAccountStatus,
} from "@/modules/payments/types/connected-account.types";

/** Country and currency of the test connected accounts (spec 011c; lowercase per v2 convention, to be verified). */
export const CONNECTED_ACCOUNT_COUNTRY = "us";
export const CONNECTED_ACCOUNT_CURRENCY = "usd";

/** Fields v2 only returns when requested (spec 011c R3). */
const ACCOUNT_INCLUDE: ("configuration.recipient" | "requirements")[] = [
  "configuration.recipient",
  "requirements",
];

const STRIPE_ACCOUNT_ID_PREFIX = "acct_";

function assertCanManage(actor: AuthUser): void {
  if (!can(actor.role, "payout.manage")) throw new AuthError("FORBIDDEN");
}

/** Stripe client or `STRIPE_NOT_CONFIGURED` (missing, live or malformed key). Logs only the config message. */
function resolveStripe(): Stripe {
  try {
    return getStripe();
  } catch (e) {
    if (e instanceof StripeConfigError) {
      console.error("[payments] Stripe is not configured:", e.message);
      throw new ConnectedAccountError("STRIPE_NOT_CONFIGURED");
    }
    throw e;
  }
}

/**
 * Creates (once) the developer's connected account (spec 011a RF2). No Stripe call runs inside a
 * transaction. The idempotency key is deterministic per row, so retries return the same account.
 */
export async function ensureConnectedAccount(
  actor: AuthUser,
): Promise<{ rowId: string; stripeAccountId: string; status: ConnectedAccountStatus }> {
  assertCanManage(actor);
  const stripe = resolveStripe();

  // Phase A: one row per developer (UNIQUE user_id + ON CONFLICT).
  await db.insert(connectedAccounts).values({ userId: actor.id }).onConflictDoNothing({
    target: connectedAccounts.userId,
  });
  const [row] = await db
    .select({
      id: connectedAccounts.id,
      stripeAccountId: connectedAccounts.stripeAccountId,
      status: connectedAccounts.status,
    })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, actor.id))
    .limit(1);
  if (!row) throw new ConnectedAccountError("STRIPE_UNAVAILABLE");
  if (row.stripeAccountId) {
    return { rowId: row.id, stripeAccountId: row.stripeAccountId, status: row.status };
  }

  // Phase B: create in Stripe (outside any transaction).
  let account: Stripe.V2.Core.Account;
  try {
    account = await stripe.v2.core.accounts.create(
      {
        // Stripe requires a contact email for a `recipient` configuration; it is never logged.
        contact_email: actor.email,
        identity: { country: CONNECTED_ACCOUNT_COUNTRY },
        dashboard: "express",
        defaults: {
          currency: CONNECTED_ACCOUNT_CURRENCY,
          responsibilities: { fees_collector: "application", losses_collector: "application" },
        },
        configuration: {
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
        include: [...ACCOUNT_INCLUDE],
        metadata: { nexora_user_id: actor.id },
      },
      { idempotencyKey: `nexora:connect-account-v2:${row.id}` },
    );
  } catch (e) {
    console.error("[payments] Stripe account create failed:", stripeErrorLogFields(e));
    throw new ConnectedAccountError(
      isDefinitiveStripeRejection(e) ? "STRIPE_NOT_CONFIGURED" : "STRIPE_UNAVAILABLE",
    );
  }
  const stripeAccountId = account?.id;
  if (typeof stripeAccountId !== "string" || !stripeAccountId.startsWith(STRIPE_ACCOUNT_ID_PREFIX)) {
    console.error("[payments] Stripe account create returned an invalid response");
    throw new ConnectedAccountError("STRIPE_UNAVAILABLE");
  }

  // Phase C: persist, only if still empty.
  const derived = deriveConnectedAccountStatus(toConnectedAccountSnapshot(account));
  try {
    const updated = await db
      .update(connectedAccounts)
      .set({ stripeAccountId, status: derived, statusSyncedAt: new Date() })
      .where(and(eq(connectedAccounts.id, row.id), isNull(connectedAccounts.stripeAccountId)))
      .returning({ id: connectedAccounts.id });
    if (updated.length > 0) return { rowId: row.id, stripeAccountId, status: derived };

    const [current] = await db
      .select({
        stripeAccountId: connectedAccounts.stripeAccountId,
        status: connectedAccounts.status,
      })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, row.id))
      .limit(1);
    if (!current?.stripeAccountId) throw new Error("connected account row vanished");
    if (current.stripeAccountId !== stripeAccountId) {
      console.error("[payments] connected account race lost; keeping the stored account", {
        rowId: row.id,
      });
    }
    return { rowId: row.id, stripeAccountId: current.stripeAccountId, status: current.status };
  } catch (e) {
    console.error("[payments] connected account persist failed", { rowId: row.id });
    if (e instanceof ConnectedAccountError) throw e;
    throw new ConnectedAccountError("STRIPE_UNAVAILABLE");
  }
}

/** Generates a one-use hosted onboarding link (spec 011a RF3). The URL is never stored nor logged. */
export async function startOnboarding(actor: AuthUser): Promise<{ onboardingUrl: string }> {
  const { stripeAccountId, status } = await ensureConnectedAccount(actor);
  if (status === "active") throw new ConnectedAccountError("ACCOUNT_ALREADY_ACTIVE");

  let appUrl: string;
  try {
    appUrl = getAppUrl();
  } catch (e) {
    if (e instanceof StripeConfigError) {
      console.error("[payments] Stripe is not configured:", e.message);
      throw new ConnectedAccountError("STRIPE_NOT_CONFIGURED");
    }
    throw e;
  }

  const stripe = resolveStripe();
  let url: string | null | undefined;
  try {
    const link = await stripe.v2.core.accountLinks.create({
      account: stripeAccountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          refresh_url: `${appUrl}/dashboard/payouts/onboarding/refresh`,
          return_url: `${appUrl}/dashboard/payouts/onboarding/return`,
          collection_options: { fields: "currently_due" },
        },
      },
    });
    url = link?.url;
  } catch (e) {
    console.error("[payments] Stripe account link failed:", stripeErrorLogFields(e));
    throw new ConnectedAccountError(
      isDefinitiveStripeRejection(e) ? "ACCOUNT_UNAVAILABLE" : "STRIPE_UNAVAILABLE",
    );
  }
  if (!isStripeHostedUrl(url)) {
    console.error("[payments] Stripe account link returned an unexpected URL");
    throw new ConnectedAccountError("STRIPE_UNAVAILABLE");
  }
  return { onboardingUrl: url };
}

/** Re-reads the account from Stripe and refreshes the cached status (spec 011a RF4). Idempotent. */
export async function syncConnectedAccount(
  actor: AuthUser,
): Promise<{ status: ConnectedAccountStatus }> {
  assertCanManage(actor);
  const { status } = await syncConnectedAccountForUser(actor.id);
  return { status };
}

/**
 * Core of `syncConnectedAccount` without an actor (spec 011b): internal callers (transfers) that
 * already know the developer id. It also returns the stored `acct_` id (null if none).
 * Never expose it to the client.
 */
export async function syncConnectedAccountForUser(
  userId: string,
): Promise<{ status: ConnectedAccountStatus; stripeAccountId: string | null }> {
  const stripe = resolveStripe();

  const [row] = await db
    .select({ id: connectedAccounts.id, stripeAccountId: connectedAccounts.stripeAccountId })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, userId))
    .limit(1);
  if (!row?.stripeAccountId) return { status: "not_started", stripeAccountId: null };
  const stripeAccountId = row.stripeAccountId;

  let account: Stripe.V2.Core.Account;
  try {
    account = await stripe.v2.core.accounts.retrieve(stripeAccountId, {
      include: [...ACCOUNT_INCLUDE],
    });
  } catch (e) {
    console.error("[payments] Stripe account retrieve failed:", stripeErrorLogFields(e));
    throw new ConnectedAccountError(
      isDefinitiveStripeRejection(e) ? "ACCOUNT_UNAVAILABLE" : "STRIPE_UNAVAILABLE",
    );
  }

  const owner = account?.metadata?.nexora_user_id;
  if (
    account?.id !== stripeAccountId ||
    (owner !== undefined && owner !== userId) ||
    account?.livemode === true
  ) {
    console.error("[payments] connected account mismatch", { rowId: row.id });
    throw new ConnectedAccountError("ACCOUNT_UNAVAILABLE");
  }

  const status = deriveConnectedAccountStatus(toConnectedAccountSnapshot(account));
  await db
    .update(connectedAccounts)
    .set({ status, statusSyncedAt: sql`now()` })
    .where(
      and(eq(connectedAccounts.id, row.id), eq(connectedAccounts.stripeAccountId, stripeAccountId)),
    );
  console.info("[payments] connected account synced", { rowId: row.id, status });
  return { status, stripeAccountId };
}

/** DB-only summary for the page (spec 011a RF5): no Stripe call, no write, no Stripe data. */
export async function getConnectedAccountOverview(
  actor: AuthUser,
): Promise<ConnectedAccountOverview> {
  assertCanManage(actor);
  const [row] = await db
    .select({
      status: connectedAccounts.status,
      stripeAccountId: connectedAccounts.stripeAccountId,
      statusSyncedAt: connectedAccounts.statusSyncedAt,
    })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.userId, actor.id))
    .limit(1);
  if (!row) return { status: "not_started", hasStripeAccount: false, statusSyncedAt: null };
  return {
    status: row.status,
    hasStripeAccount: row.stripeAccountId !== null,
    statusSyncedAt: row.statusSyncedAt,
  };
}
