// @vitest-environment node
import { describe, expect, it } from "vitest";
import { markdownToPlainText, sanitizeUrl, summarizeMarkdown } from "@/lib/markdown";

describe("sanitizeUrl", () => {
  it.each(["https://a.com", "http://a.com/x?y=1", "mailto:a@b.co", "HTTPS://A.COM"])(
    "allows %s",
    (url) => {
      expect(sanitizeUrl(url)).toBe(url);
    },
  );

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "java\u0000script:alert(1)",
    "\u0001javascript:alert(1)",
    "jav&#x09;ascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "tel:+123456",
    "/ruta",
    "ruta/relativa",
    "//evil.com",
    "#a",
    "",
  ])("rejects %j", (url) => {
    expect(sanitizeUrl(url)).toBeNull();
  });

  it("rejects undefined", () => {
    expect(sanitizeUrl(undefined)).toBeNull();
  });
});

describe("markdownToPlainText", () => {
  it("returns empty for empty input", () => {
    expect(markdownToPlainText("")).toBe("");
  });

  it("strips headings and emphasis", () => {
    expect(markdownToPlainText("## Hola **mundo**")).toBe("Hola mundo");
    expect(markdownToPlainText("*a* _b_ ~~c~~ __d__")).toBe("a b c d");
  });

  it("keeps snake_case words", () => {
    expect(markdownToPlainText("use snake_case here")).toBe("use snake_case here");
  });

  it("strips code, fences and keeps code content", () => {
    expect(markdownToPlainText("uso `npm i`\n```ts\nconst a = 1;\n```")).toBe(
      "uso npm i const a = 1;",
    );
  });

  it("keeps link text and image alt", () => {
    expect(markdownToPlainText("[sitio](https://a.com) y ![logo](https://a.com/l.png)")).toBe(
      "sitio y logo",
    );
    expect(markdownToPlainText("[x][1]\n\n[1]: https://a.com")).toBe("x");
  });

  it("strips lists, task lists, quotes, tables and hr", () => {
    const md = "- uno\n1. dos\n- [x] hecho\n> cita\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---";
    const out = markdownToPlainText(md);
    expect(out).toBe("uno dos hecho cita a b 1 2");
    expect(out).not.toMatch(/#|\*\*|\|---\||\[.*\]\(.*\)|<[^>]+>/);
  });

  it("strips HTML tags", () => {
    expect(markdownToPlainText("hola <b>x</b> <script>alert(1)</script>")).toBe("hola x alert(1)");
  });

  it("collapses whitespace", () => {
    expect(markdownToPlainText("a\n\n\n   b\t\tc")).toBe("a b c");
  });

  it("finishes quickly on pathological input", () => {
    const inputs = [
      "<".repeat(5000),
      "![".repeat(2500),
      "[".repeat(5000),
      "*_".repeat(2500),
      "`".repeat(5000),
      "> ".repeat(2500),
      "- ".repeat(2500),
      "|".repeat(5000),
    ];
    const t0 = Date.now();
    for (const input of inputs) markdownToPlainText(input);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe("summarizeMarkdown", () => {
  it("returns the text when short", () => {
    expect(summarizeMarkdown("## Hola **mundo**", 240)).toBe("Hola mundo");
  });

  it("truncates with ellipsis without cutting words and never exceeds maxLength", () => {
    const out = summarizeMarkdown("uno dos tres cuatro cinco", 14);
    expect(out).toBe("uno dos tres…");
    expect(out.length).toBeLessThanOrEqual(14);
  });

  it("hard cuts when there is no good space", () => {
    const out = summarizeMarkdown("a".repeat(100), 10);
    expect(out).toBe(`${"a".repeat(9)}…`);
  });

  it("handles tiny maxLength", () => {
    expect(summarizeMarkdown("hola mundo", 1)).toBe("…");
    expect(summarizeMarkdown("hola mundo", 0)).toBe("");
  });

  it("bounds a 5000 char input to 240", () => {
    const out = summarizeMarkdown("palabra ".repeat(700), 240);
    expect(out.length).toBeLessThanOrEqual(240);
    expect(out.endsWith("…")).toBe(true);
  });
});
