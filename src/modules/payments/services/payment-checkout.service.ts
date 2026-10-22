import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db/client";
import { getAppUrl, getStripe, StripeConfigError } from "@/lib/stripe";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { requireOwnership } from "@/modules/auth/services/current-user.service";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { connectedAccounts } from "@/modules/payments/schema/connected-accounts.table";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import { PaymentError } from "@/modules/payments/services/payment-errors";
import type { CheckoutStartResult } from "@/modules/payments/types/payment.types";
import { projects } from "@/modules/projects/schema/projects.table";
import { proposalSelections } from "@/modules/proposals/schema/proposal-selections.table";
import { proposals } from "@/modules/proposals/schema/proposals.table";

/** The Checkout Session expires this long after the attempt was created (spec 009 D-F). */
export const CHECKOUT_SESSION_TTL_SECONDS = 3600;
/** A pending attempt without a stored session id is only resumed during this window. */
export const RESUME_WINDOW_SECONDS = 600;

const PRODUCT_NAME_MAX_LENGTH = 80;
/** Errors where Stripe certainly did not create the session. Everything else is ambiguous. */
const DEFINITIVE_REJECTION_TYPES = new Set([
  "StripeInvalidRequestError",
  "StripeAuthenticationError",
  "StripePermissionError",
]);

type Attempt = {
  id: string;
  createdAt: Date;
  amountCents: number;
  currency: string;
  stripeCheckoutSessionId: string | null;
};

type Prepared = {
  kind: "created" | "existing";
  attempt: Attempt;
  projectId: string;
  projectTitle: string;
  proposalId: string;
  clientId: string;
};

/** Result of the Stripe phase: a final answer, or "restart" after the stale attempt was canceled. */
type StripeOutcome = CheckoutStartResult | "restart";

const attemptColumns = {
  id: paymentAttempts.id,
  createdAt: paymentAttempts.createdAt,
  amountCents: paymentAttempts.amountCents,
  currency: paymentAttempts.currency,
  stripeCheckoutSessionId: paymentAttempts.stripeCheckoutSessionId,
};

/**
 * Creates (or resumes) the pending payment attempt of a project and its Stripe Checkout Session
 * (spec 009 RF4). Phase A (transaction, locks project -> proposal) inserts the attempt BEFORE Stripe
 * is called; phase B talks to Stripe outside any transaction; phase C stores the session id.
 * Amount and currency always come from the accepted proposal stored in the DB, never from input.
 */
export async function createCheckoutForProject(
  actor: AuthUser,
  projectId: string,
): Promise<CheckoutStartResult> {
  if (!can(actor.role, "payment.start")) throw new AuthError("FORBIDDEN");
  const { stripe, appUrl } = resolveStripeConfig();

  // At most one restart: after canceling a stale/expired attempt a fresh one is created.
  for (let round = 0; round < 2; round++) {
    const prepared = await prepareAttempt(actor, projectId);
    const outcome = await runStripePhase(stripe, appUrl, prepared);
    if (outcome !== "restart") return outcome;
  }
  throw new PaymentError("STRIPE_UNAVAILABLE");
}

function resolveStripeConfig(): { stripe: Stripe; appUrl: string } {
  try {
    return { stripe: getStripe(), appUrl: getAppUrl() };
  } catch (e) {
    if (e instanceof StripeConfigError) {
      console.error("[payments] Stripe configuration error:", e.message);
      throw new PaymentError("STRIPE_NOT_CONFIGURED");
    }
    throw e;
  }
}

// ---------------------------------------------------------------- Phase A

async function prepareAttempt(actor: AuthUser, projectId: string): Promise<Prepared> {
  return db.transaction(async (tx) => {
    // Project lock first (same order as closeProject / selectProposal). Foreign owner -> NOT_FOUND.
    const [project] = await tx
      .select({
        id: projects.id,
        clientId: projects.clientId,
        status: projects.status,
        title: projects.title,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
      .for("update");
    if (!project) throw new AuthError("NOT_FOUND");
    requireOwnership(actor, project.clientId);
    if (project.status !== "proposal_selected") throw new PaymentError("PAYMENT_NOT_ALLOWED");

    // Winning proposal second (FOR SHARE). Missing row = inconsistency.
    const [proposal] = await tx
      .select({ id: proposals.id, priceCents: proposals.priceCents, developerId: proposals.developerId })
      .from(proposalSelections)
      .innerJoin(
        proposals,
        and(
          eq(proposals.id, proposalSelections.proposalId),
          eq(proposals.projectId, proposalSelections.projectId),
        ),
      )
      .where(and(eq(proposalSelections.projectId, projectId), eq(proposals.status, "accepted")))
      .limit(1)
      .for("share", { of: proposals });
    if (!proposal) throw new PaymentError("PAYMENT_NOT_ALLOWED");

    const base = {
      projectId,
      projectTitle: project.title,
      proposalId: proposal.id,
      clientId: project.clientId,
    };

    const [active] = await tx
      .select({ ...attemptColumns, status: paymentAttempts.status })
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.projectId, projectId),
          inArray(paymentAttempts.status, ["pending", "completed_test"]),
        ),
      )
      .limit(1);
    if (active) {
      if (active.status === "completed_test") throw new PaymentError("PAYMENT_ALREADY_ACTIVE");
      return { kind: "existing", attempt: active, ...base };
    }

    // Do not collect money that cannot be transferred: the winner needs an active connected account
    // (cached status; the transfer re-reads it from Stripe before moving anything).
    const [payout] = await tx
      .select({ status: connectedAccounts.status })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, proposal.developerId))
      .limit(1);
    if (payout?.status !== "active") throw new PaymentError("DEVELOPER_PAYOUTS_NOT_READY");

    // The attempt is committed before Stripe is called. A UNIQUE firing here is the safety net.
    const [created] = await tx
      .insert(paymentAttempts)
      .values({
        projectId,
        proposalId: proposal.id,
        clientId: project.clientId,
        amountCents: proposal.priceCents,
        currency: "USD",
        status: "pending",
      })
      .onConflictDoNothing()
      .returning(attemptColumns);
    if (!created) throw new PaymentError("PAYMENT_ALREADY_ACTIVE");
    return { kind: "created", attempt: created, ...base };
  });
}

// ---------------------------------------------------------------- Phase B

async function runStripePhase(
  stripe: Stripe,
  appUrl: string,
  prepared: Prepared,
): Promise<StripeOutcome> {
  const { attempt, kind } = prepared;

  if (attempt.stripeCheckoutSessionId) {
    return reuseExistingSession(stripe, attempt.id, attempt.stripeCheckoutSessionId);
  }

  if (kind === "existing") {
    const ageMs = Date.now() - attempt.createdAt.getTime();
    if (ageMs > RESUME_WINDOW_SECONDS * 1000) {
      // Abandoned before the session id was stored. Any ghost session never got a URL: nobody can pay it.
      await cancelAttempt(attempt.id, { withoutSession: true });
      return "restart";
    }
  }

  return createSession(stripe, appUrl, prepared);
}

async function reuseExistingSession(
  stripe: Stripe,
  attemptId: string,
  sessionId: string,
): Promise<StripeOutcome> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    logStripeError("retrieve", e);
    throw new PaymentError("STRIPE_UNAVAILABLE");
  }

  if (session.livemode !== false) throw new PaymentError("STRIPE_NOT_CONFIGURED");

  if (session.status === "open" && isStripeCheckoutUrl(session.url)) {
    return { attemptId, checkoutUrl: session.url, reused: true };
  }
  if (session.status === "expired") {
    // Reconciliation: only because Stripe's API reported it as expired.
    await cancelAttempt(attemptId);
    return "restart";
  }
  // Paid: confirming is spec 010's job. Unknown/null status or open without url: not reusable.
  if (session.status === "complete") throw new PaymentError("PAYMENT_ALREADY_ACTIVE");
  throw new PaymentError("STRIPE_UNAVAILABLE");
}

async function createSession(
  stripe: Stripe,
  appUrl: string,
  prepared: Prepared,
): Promise<StripeOutcome> {
  const { attempt, kind } = prepared;
  if (
    !Number.isSafeInteger(attempt.amountCents) ||
    attempt.amountCents <= 0 ||
    attempt.currency !== "USD"
  ) {
    await cancelAttempt(attempt.id, { withoutSession: true });
    throw new PaymentError("PAYMENT_NOT_ALLOWED");
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(buildSessionParams(appUrl, prepared), {
      idempotencyKey: `nexora:checkout:${attempt.id}`,
    });
  } catch (e) {
    logStripeError("create", e);
    const type = (e as { type?: unknown } | null)?.type;
    // Definitive rejection: the session was not created. Anything else stays pending and resumable.
    if (typeof type === "string" && DEFINITIVE_REJECTION_TYPES.has(type)) {
      await cancelAttempt(attempt.id, { withoutSession: true });
    }
    throw new PaymentError("STRIPE_UNAVAILABLE");
  }

  if (session.livemode !== false) {
    await cancelAttempt(attempt.id, { withoutSession: true });
    throw new PaymentError("STRIPE_NOT_CONFIGURED");
  }
  const checkoutUrl = session.url;
  if (!session.id || !isStripeCheckoutUrl(checkoutUrl)) {
    await cancelAttempt(attempt.id, { withoutSession: true });
    throw new PaymentError("STRIPE_UNAVAILABLE");
  }

  await storeSessionId(attempt.id, session.id);
  return { attemptId: attempt.id, checkoutUrl, reused: kind === "existing" };
}

/** Params derive only from stored rows (never Date.now()) so a resume is identical for Stripe. */
function buildSessionParams(
  appUrl: string,
  { attempt, projectId, projectTitle, proposalId, clientId }: Prepared,
): Stripe.Checkout.SessionCreateParams {
  const ids = {
    payment_attempt_id: attempt.id,
    project_id: projectId,
    proposal_id: proposalId,
    client_id: clientId,
  };
  return {
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: attempt.amountCents,
          product_data: { name: projectTitle.slice(0, PRODUCT_NAME_MAX_LENGTH) },
        },
      },
    ],
    client_reference_id: attempt.id,
    metadata: ids,
    payment_intent_data: { metadata: { ...ids } },
    success_url: `${appUrl}/projects/${projectId}/payment?checkout=success`,
    cancel_url: `${appUrl}/projects/${projectId}/payment?checkout=cancel`,
    expires_at: Math.floor(attempt.createdAt.getTime() / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
  };
}

// ---------------------------------------------------------------- Phase C and helpers

async function storeSessionId(attemptId: string, sessionId: string): Promise<void> {
  try {
    const stored = await db
      .update(paymentAttempts)
      .set({ stripeCheckoutSessionId: sessionId })
      .where(
        and(
          eq(paymentAttempts.id, attemptId),
          eq(paymentAttempts.status, "pending"),
          isNull(paymentAttempts.stripeCheckoutSessionId),
        ),
      )
      .returning({ id: paymentAttempts.id });
    if (stored.length > 0) return;

    // Another request with the same idempotency key may have stored the same session first.
    const [current] = await db
      .select({
        status: paymentAttempts.status,
        sessionId: paymentAttempts.stripeCheckoutSessionId,
      })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, attemptId))
      .limit(1);
    if (current?.status === "pending" && current.sessionId === sessionId) return;
  } catch (e) {
    // DB failure after Stripe created the session: the attempt stays pending and resumable.
    console.error("[payments] could not store the checkout session id:", errorName(e));
    throw new PaymentError("STRIPE_UNAVAILABLE");
  }
  throw new PaymentError("PAYMENT_ALREADY_ACTIVE");
}

/** pending -> canceled by the server; the state guard lives in the WHERE. */
async function cancelAttempt(
  attemptId: string,
  opts: { withoutSession?: boolean } = {},
): Promise<void> {
  const conditions = [eq(paymentAttempts.id, attemptId), eq(paymentAttempts.status, "pending")];
  if (opts.withoutSession) conditions.push(isNull(paymentAttempts.stripeCheckoutSessionId));
  await db
    .update(paymentAttempts)
    .set({ status: "canceled" })
    .where(and(...conditions));
}

/** Checkout URLs only ever point to https://*.stripe.com. */
function isStripeCheckoutUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".stripe.com");
  } catch {
    return false;
  }
}

function errorName(e: unknown): string {
  return e instanceof Error ? e.name : "unknown";
}

/** Logs only type/code/status/requestId: never messages, keys or Checkout URLs. */
function logStripeError(operation: string, e: unknown): void {
  const err = (e ?? {}) as {
    type?: unknown;
    code?: unknown;
    statusCode?: unknown;
    requestId?: unknown;
  };
  console.error(`[payments] Stripe ${operation} failed:`, {
    type: err.type,
    code: err.code,
    statusCode: err.statusCode,
    requestId: err.requestId,
  });
}
