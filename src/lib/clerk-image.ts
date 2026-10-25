export const CLERK_IMAGE_HOST = "img.clerk.com";
export const IMAGE_URL_MAX_LENGTH = 2048;

/**
 * Returns the Clerk image URL only if it is a trusted https://img.clerk.com URL
 * (no port, credentials, query or hash) and the user actually has an image.
 */
export function normalizeClerkImageUrl(raw: unknown, hasImage: boolean | undefined): string | null {
  if (hasImage !== true) return null;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > IMAGE_URL_MAX_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname !== CLERK_IMAGE_HOST) return null;
  if (url.port || url.username || url.password || url.search || url.hash) return null;

  const normalized = url.toString();
  return normalized.length <= IMAGE_URL_MAX_LENGTH ? normalized : null;
}
