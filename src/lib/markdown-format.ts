export type MarkdownFormat =
  | "heading"
  | "bold"
  | "italic"
  | "list"
  | "task-list"
  | "link"
  | "code"
  | "table";

export type TextEdit = { value: string; selectionStart: number; selectionEnd: number };

const INLINE_MARKERS = { bold: "**", italic: "*", code: "`" } as const;
const LINE_PREFIXES = { heading: "## ", list: "- ", "task-list": "- [ ] " } as const;
const TABLE_TEMPLATE = "| Columna 1 | Columna 2 |\n| --- | --- |\n| Dato | Dato |\n";

function splice(value: string, start: number, end: number, insert: string): string {
  return value.slice(0, start) + insert + value.slice(end);
}

export function applyMarkdownFormat(
  format: MarkdownFormat,
  value: string,
  selectionStart: number,
  selectionEnd: number,
): TextEdit {
  const a = Math.max(0, Math.min(selectionStart, value.length));
  const b = Math.max(0, Math.min(selectionEnd, value.length));
  const start = Math.min(a, b);
  const end = Math.max(a, b);

  if (format === "bold" || format === "italic" || format === "code") {
    const m = INLINE_MARKERS[format];
    return {
      value: splice(value, start, end, `${m}${value.slice(start, end)}${m}`),
      selectionStart: start + m.length,
      selectionEnd: end + m.length,
    };
  }

  if (format === "link") {
    const label = value.slice(start, end);
    if (label) {
      const urlStart = start + label.length + 3;
      return {
        value: splice(value, start, end, `[${label}](https://)`),
        selectionStart: urlStart,
        selectionEnd: urlStart + "https://".length,
      };
    }
    return {
      value: splice(value, start, end, "[texto](https://)"),
      selectionStart: start + 1,
      selectionEnd: start + 1 + "texto".length,
    };
  }

  if (format === "table") {
    const needsBreak = start > 0 && value[start - 1] !== "\n";
    const insert = (needsBreak ? "\n" : "") + TABLE_TEMPLATE;
    const cursor = start + insert.length;
    return { value: splice(value, start, end, insert), selectionStart: cursor, selectionEnd: cursor };
  }

  // Line formats: prefix every line touched by the selection.
  const prefix = LINE_PREFIXES[format];
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const block = value.slice(lineStart, end);
  const lines = block.split("\n");
  const prefixed = lines.map((l) => prefix + l).join("\n");
  return {
    value: splice(value, lineStart, end, prefixed),
    selectionStart: start + prefix.length,
    selectionEnd: end + prefix.length * lines.length,
  };
}
