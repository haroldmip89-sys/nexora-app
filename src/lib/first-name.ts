/** First word (letters/digits, Unicode) of a display name; "" when there is none. */
export function getFirstName(displayName: string | null | undefined): string {
  if (!displayName) return "";
  const match = displayName.match(/[\p{L}\p{N}]+/u);
  return match ? match[0] : "";
}
