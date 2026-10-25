import "server-only";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import { deriveDisplayName, pickPrimaryEmail } from "@/modules/auth/services/clerk-identity.service";
import { normalizeClerkImageUrl } from "@/lib/clerk-image";
import {
  anonymizeByClerkUserId,
  syncImageUrl,
  syncProfile,
} from "@/modules/users/services/users.service";

/**
 * Applies a verified Clerk webhook event to Neon. Only `user.updated` and `user.deleted`
 * have effects; any other event is ignored. Idempotent; never creates rows nor touches `role`.
 * Errors from the data layer propagate so the caller can answer 5xx and Svix retries.
 */
export async function handleClerkEvent(evt: WebhookEvent): Promise<void> {
  switch (evt.type) {
    case "user.updated": {
      const {
        id,
        email_addresses,
        primary_email_address_id,
        first_name,
        last_name,
        username,
        image_url,
        has_image,
      } = evt.data;
      // Photo sync is independent of the name/email block (023 D6); an invalid URL clears the copy.
      if (id) await syncImageUrl(id, normalizeClerkImageUrl(image_url, has_image));
      const email = pickPrimaryEmail(email_addresses, primary_email_address_id);
      // users.email is NOT NULL: without a primary email there is nothing to sync.
      if (!id || !email) return;
      await syncProfile(id, {
        email,
        displayName: deriveDisplayName({
          firstName: first_name,
          lastName: last_name,
          username,
          email,
        }),
      });
      return;
    }
    case "user.deleted": {
      // UserDeletedJSON.id is optional.
      const id = evt.data.id;
      if (!id) return;
      await anonymizeByClerkUserId(id);
      return;
    }
    default:
      return;
  }
}
