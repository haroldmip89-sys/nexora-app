import type { NextRequest } from "next/server";
import { constructStripeEvent, StripeConfigError } from "@/lib/stripe";
import { handleStripeEvent } from "@/modules/payments/services/payment-event.service";

// The Stripe SDK is Node-only (spec 010 RF2, D-I).
export const runtime = "nodejs";

// Far above any real Stripe event; protects the in-memory read (spec 015 D3/H2).
const MAX_BODY_BYTES = 1024 * 1024;

const tooLarge = () => new Response("Payload too large", { status: 413 });

/** Reads the body as text, or returns null once it exceeds the cap. */
async function readBodyCapped(req: NextRequest): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Public route: authenticated by the Stripe signature, never by a session (spec 010 RF2).
// Nothing from the body, the signature header or the secret is ever logged or echoed.
export async function POST(req: NextRequest): Promise<Response> {
  const declared = req.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) {
    return tooLarge();
  }
  const rawBody = await readBodyCapped(req);
  if (rawBody === null) return tooLarge();
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
