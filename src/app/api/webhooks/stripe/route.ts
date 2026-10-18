import type { NextRequest } from "next/server";
import { constructStripeEvent, StripeConfigError } from "@/lib/stripe";
import { handleStripeEvent } from "@/modules/payments/services/payment-event.service";

// The Stripe SDK is Node-only (spec 010 RF2, D-I).
export const runtime = "nodejs";

// Public route: authenticated by the Stripe signature, never by a session (spec 010 RF2).
// Nothing from the body, the signature header or the secret is ever logged or echoed.
export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: ReturnType<typeof constructStripeEvent>;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch (e) {
    if (e instanceof StripeConfigError) {
      // Our misconfiguration, not the sender's: 5xx so Stripe retries once it is fixed.
      console.error("[stripe webhook]", e.message);
      return new Response("Webhook not configured", { status: 500 });
    }
    return new Response("Invalid webhook", { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch {
    // Transient failure: the transaction already rolled back; 5xx so Stripe retries.
    return new Response("Webhook processing failed", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
