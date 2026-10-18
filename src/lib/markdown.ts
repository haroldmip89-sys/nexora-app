export const ALLOWED_LINK_PROTOCOLS = ["http:", "https:", "mailto:"] as const;

// Control chars, whitespace and C1 controls: browsers ignore several of them inside a scheme.
const INVISIBLE_CHARS = /[\u0000- \u007f-\u009f]/g;

/**
 * Returns the URL (without control chars/whitespace) if its scheme is allowed, or null.
 * Rejects relative URLs, #anchors, protocol-relative URLs and any other scheme.
 */
export function sanitizeUrl(url: string | undefined): string | null {
  if (!url) return null;
  const cleaned = url.replace(INVISIBLE_CHARS, "");
  if (!cleaned) return null;
  try {
    const { protocol } = new URL(cleaned);
    return (ALLOWED_LINK_PROTOCOLS as readonly string[]).includes(protocol) ? cleaned : null;
  } catch {
    return null;
  }
}

// All patterns below are line-bounded and use bounded quantifiers to stay linear.
function stripInline(line: string): string {
  return line
    .replace(/<(https?:\/\/[^>\s]{1,2000})>/gi, "$1")
    .replace(/<\/?[a-zA-Z][^<>]{0,200}>/g, " ")
    .replace(/!\[([^\]]{0,300})\]\([^)\s]{0,2000}(?:\s[^)]{0,300})?\)/g, "$1")
    .replace(/\[([^\]]{0,300})\]\([^)\s]{0,2000}(?:\s[^)]{0,300})?\)/g, "$1")
    .replace(/!?\[([^\]]{0,300})\]\[[^\]]{0,100}\]/g, "$1")
    .replace(/`+/g, "")
    .replace(/(\*\*|__|~~)/g, "")
    .replace(/\*/g, "")
    .replace(/(^|\s)_+|_+(?=\s|$)/g, "$1")
    .replace(/\|/g, " ");
}

/** Markdown to single-line plain text. */
export function markdownToPlainText(markdown: string): string {
  if (!markdown) return "";
  const out: string[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.slice(0, 5000);
    if (/^\s{0,3}(```|~~~)/.test(line)) continue; // fence markers
    if (/^\s{0,3}\[[^\]]{1,100}\]:\s/.test(line)) continue; // reference definitions
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) continue; // hr
    if (/^[\s|:-]+$/.test(line) && line.includes("-") && line.includes("|")) continue; // table separator
    const text = line
      .replace(/^\s{0,3}(?:>\s?){1,10}/, "")
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s{0,10}(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?/, "");
    out.push(stripInline(text));
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Plain text truncated to maxLength (including the ellipsis), avoiding mid-word cuts when possible. */
export function summarizeMarkdown(markdown: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  const text = markdownToPlainText(markdown);
  if (text.length <= maxLength) return text;
  if (maxLength === 1) return "…";
  let cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > (maxLength - 1) / 2) cut = cut.slice(0, lastSpace);
  return `${cut.trimEnd()}…`;
}
