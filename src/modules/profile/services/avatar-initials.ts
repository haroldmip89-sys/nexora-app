/** Up to 2 uppercase letters from the first two words ("Lucía Ramos" -> "LR"); "?" if none. */
export function getInitials(displayName: string): string {
  const words = displayName
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 2);
  if (words.length === 0) return "?";
  return words.map((w) => Array.from(w)[0].toUpperCase()).join("");
}
