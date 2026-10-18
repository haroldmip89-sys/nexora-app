import "server-only";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db/client";
import { processedPaymentEvents } from "@/modules/payments/schema/processed-payment-events.table";
import {
  applySessionOutcome,
  type SessionOutcome,
} from "@/modules/payments/services/payment-session-effects";
import type { StripeEventOutcome } from "@/modules/payments/types/payment.types";

const OUTCOME_BY_EVENT_TYPE: Record<string, SessionOutcome> = {
  "checkout.session.completed": "completed",
  "checkout.session.async_payment_succeeded": "completed",
  "checkout.session.async_payment_failed": "failed",
  "checkout.session.expired": "expired",
};

/**
 * Processes an already verified Stripe event (spec 010 RF4). Idempotent by `event.id`: the event row
 * and every effect share one transaction, so any error reverts all of it and propagates (-> 5xx).
 * Logs only event id, type, result and reason.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<StripeEventOutcome> {
  if (event.livemode !== false) return discard(event);

  const outcome = OUTCOME_BY_EVENT_TYPE[event.type];
  if (!outcome) return { result: "unhandled" };

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.livemode !== false) return discard(event);

  const processed = await db.transaction(async (tx): Promise<StripeEventOutcome> => {
    const inserted = await tx
      .insert(processedPaymentEvents)
      .values({ stripeEventId: event.id, type: event.type, result: "ignored" })
      .onConflictDoNothing({ target: processedPaymentEvents.stripeEventId })
      .returning({ id: processedPaymentEvents.stripeEventId });
    if (inserted.length === 0) return { result: "duplicate" };

    const effect = await applySessionOutcome(tx, { outcome, session });
    await tx
      .update(processedPaymentEvents)
      .set({ result: effect.result, paymentAttemptId: effect.attemptId })
      .where(eq(processedPaymentEvents.stripeEventId, event.id));

    return effect.result === "applied"
      ? { result: "applied", reason: effect.reason }
      : { result: "ignored", reason: effect.reason };
  });

  const reason = "reason" in processed ? processed.reason : undefined;
  console.info("[payments] stripe event", {
    eventId: event.id,
    type: event.type,
    result: processed.result,
    reason,
  });
  return processed;
}

function discard(event: Stripe.Event): StripeEventOutcome {
  console.warn("[payments] discarded non-test event", { eventId: event.id, type: event.type });
  return { result: "discarded", reason: "livemode" };
}
