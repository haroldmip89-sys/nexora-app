const FALLBACK = "Cliente";
const NAME_TOKEN = /^[\p{L}\p{M}'’-]+$/u;

/**
 * Public, privacy-safe client name: "Maria Gomez" -> "Maria G.". Anything that does not look
 * like a human name (emails, usernames with digits/dots, anonymized users) becomes "Cliente".
 */
export function abbreviateClientName(displayName: string): string {
  const tokens = displayName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return FALLBACK;
  if (tokens.join(" ") === "Deleted user") return FALLBACK;
  if (!tokens.every((t) => NAME_TOKEN.test(t))) return FALLBACK;
  if (tokens.length === 1) return tokens[0];
  const last = tokens[tokens.length - 1];
  const initial = Array.from(last)[0].toLocaleUpperCase("es");
  return `${tokens[0]} ${initial}.`;
}
