// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyMarkdownFormat, type MarkdownFormat } from "@/lib/markdown-format";

describe("applyMarkdownFormat", () => {
  it.each([
    ["bold", "**"],
    ["italic", "*"],
    ["code", "`"],
  ] as const)("%s wraps the selection", (format, m) => {
    const r = applyMarkdownFormat(format, "hola mundo", 5, 10);
    expect(r.value).toBe(`hola ${m}mundo${m}`);
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("mundo");
  });

  it.each([
    ["bold", "****", 2],
    ["italic", "**", 1],
    ["code", "``", 1],
  ] as const)("%s without selection inserts markers with the cursor inside", (format, text, pos) => {
    const r = applyMarkdownFormat(format, "ab", 1, 1);
    expect(r.value).toBe(`a${text}b`);
    expect(r.selectionStart).toBe(1 + pos);
    expect(r.selectionEnd).toBe(1 + pos);
  });

  it("link wraps selection and selects the url", () => {
    const r = applyMarkdownFormat("link", "ver sitio", 4, 9);
    expect(r.value).toBe("ver [sitio](https://)");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("https://");
  });

  it("link without selection inserts a template selecting the label", () => {
    const r = applyMarkdownFormat("link", "", 0, 0);
    expect(r.value).toBe("[texto](https://)");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("texto");
  });

  it.each([
    ["heading", "## "],
    ["list", "- "],
    ["task-list", "- [ ] "],
  ] as const)("%s prefixes the current line", (format, prefix) => {
    const r = applyMarkdownFormat(format, "uno\ndos\ntres", 6, 6);
    expect(r.value).toBe(`uno\n${prefix}dos\ntres`);
    expect(r.selectionStart).toBe(6 + prefix.length);
  });

  it("line formats on empty text", () => {
    const r = applyMarkdownFormat("list", "", 0, 0);
    expect(r.value).toBe("- ");
    expect(r.selectionStart).toBe(2);
    expect(r.selectionEnd).toBe(2);
  });

  it("line formats prefix every line of a multiline selection", () => {
    const r = applyMarkdownFormat("list", "uno\ndos\ntres", 1, 9);
    expect(r.value).toBe("- uno\n- dos\n- tres");
    expect(r.selectionStart).toBe(3);
    expect(r.selectionEnd).toBe(9 + 2 * 3);
  });

  it("table inserts a 2 column GFM template, on a new line when needed", () => {
    const r = applyMarkdownFormat("table", "texto", 5, 5);
    expect(r.value.startsWith("texto\n| Columna 1 | Columna 2 |\n| --- | --- |")).toBe(true);
    expect(r.selectionStart).toBe(r.value.length);
    const atStart = applyMarkdownFormat("table", "", 0, 0);
    expect(atStart.value.startsWith("| Columna 1")).toBe(true);
  });

  it("clamps and orders out-of-range selections", () => {
    const formats: MarkdownFormat[] = [
      "heading", "bold", "italic", "list", "task-list", "link", "code", "table",
    ];
    for (const f of formats) {
      for (const [s, e] of [[100, 200], [5, 2], [-3, 1], [0, 0], [0, 4]]) {
        const r = applyMarkdownFormat(f, "abcd", s, e);
        expect(r.selectionStart).toBeLessThanOrEqual(r.selectionEnd);
        expect(r.selectionStart).toBeGreaterThanOrEqual(0);
        expect(r.selectionEnd).toBeLessThanOrEqual(r.value.length);
      }
    }
  });
});
