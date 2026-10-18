import type { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { handleClerkEvent } from "@/modules/auth/services/clerk-webhook.service";

// Public route: authenticated by the Svix signature, never by a session (spec 004 RF3/RF4).
export async function POST(req: NextRequest): Promise<Response> {
  let evt: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    evt = await verifyWebhook(req);
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }

  try {
    await handleClerkEvent(evt);
  } catch {
    // Transient failure: 5xx so Svix retries. Nothing from the payload is logged (PII).
    return new Response("Webhook processing failed", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
