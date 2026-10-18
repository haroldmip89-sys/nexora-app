import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MarkdownContent } from "@/components/shared/markdown-content";

afterEach(cleanup);

const DANGEROUS = "script, img, iframe, style, svg, [onerror], [onclick], [onload]";

function renderMd(source: string) {
  return render(<MarkdownContent source={source} />).container;
}

describe("MarkdownContent formatting", () => {
  it("renders basic GFM blocks", () => {
    const c = renderMd(
      "# T\n\n## S\n\n### U\n\n#### V\n\npárrafo **neg** *cur* `cod`\n\n- a\n- b\n\n1. x\n2. y\n\n> cita\n\n---\n\n```\nbloque\n```",
    );
    expect(c.querySelector("h1")).toBeNull();
    expect(c.querySelectorAll("h2")).toHaveLength(2);
    expect(c.querySelector("h3")?.textContent).toBe("U");
    expect(c.querySelector("h4")?.textContent).toBe("V");
    expect(c.querySelector("strong")?.textContent).toBe("neg");
    expect(c.querySelector("em")?.textContent).toBe("cur");
    expect(c.querySelector("ul")).toBeTruthy();
    expect(c.querySelector("ol")).toBeTruthy();
    expect(c.querySelector("blockquote")).toBeTruthy();
    expect(c.querySelector("hr")).toBeTruthy();
    expect(c.querySelector("pre code")?.textContent).toContain("bloque");
  });

  it("never generates h1 even for h5/h6", () => {
    const c = renderMd("# a\n\n##### b\n\n###### c");
    expect(c.querySelector("h1, h5, h6")).toBeNull();
  });

  it("wraps tables in a horizontal scroll container", () => {
    const c = renderMd("| a | b |\n|---|---|\n| 1 | 2 |");
    const table = c.querySelector("table");
    expect(table).toBeTruthy();
    expect(table?.parentElement?.className).toContain("overflow-x-auto");
    expect(c.querySelectorAll("th")).toHaveLength(2);
  });

  it("renders disabled task checkboxes with accessible text", () => {
    const c = renderMd("- [x] hecho\n- [ ] falta");
    const boxes = c.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
    expect(boxes).toHaveLength(2);
    expect(boxes[0].disabled && boxes[1].disabled).toBe(true);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    expect(screen.getByText("Completado:")).toBeTruthy();
    expect(screen.getByText("Pendiente:")).toBeTruthy();
  });

  it("renders nothing for empty source", () => {
    expect(renderMd("").innerHTML).toBe("");
  });

  it("does not throw on malformed input", () => {
    expect(() => renderMd("** negrita sin cerrar")).not.toThrow();
    expect(() => renderMd("[a](<b\n| | |\n```\n<<<>>>")).not.toThrow();
    expect(() => renderMd("# ".repeat(2500))).not.toThrow();
    expect(() => renderMd("**a** ".repeat(1000))).not.toThrow();
  });
});

describe("MarkdownContent raw HTML", () => {
  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)>",
    '<iframe src="https://evil.com"></iframe>',
    '<div onclick="alert(1)">x</div>',
    "<style>body{display:none}</style>",
    '<a href="javascript:alert(1)" onclick="alert(1)">x</a>',
    "- <script>alert(1)</script>\n- <img src=x onerror=alert(1)>",
    "> <img src=x onerror=alert(1)>",
    "| a |\n|---|\n| <img src=x onerror=alert(1)> |",
  ])("creates no dangerous elements for %j", (md) => {
    const c = renderMd(md);
    expect(c.querySelector(DANGEROUS)).toBeNull();
    expect(c.querySelector("a[href^='javascript' i]")).toBeNull();
    const withHandlers = [...c.querySelectorAll("*")].filter((el) =>
      el.getAttributeNames().some((n) => n.startsWith("on")),
    );
    expect(withHandlers).toHaveLength(0);
  });

  it("shows raw HTML as escaped text (pinned behavior), never as elements", () => {
    const c = renderMd("hola <script>alert(1)</script> fin");
    expect(c.querySelector("script")).toBeNull();
    expect(c.textContent).toContain("hola");
    expect(c.textContent).toContain("<script>");
    expect(c.innerHTML).toContain("&lt;script&gt;");
  });

  it("shows HTML literally inside code blocks and inline code", () => {
    const c = renderMd("```html\n<script>alert(1)</script>\n```\n\n`<img src=x onerror=alert(1)>`");
    expect(c.querySelector(DANGEROUS)).toBeNull();
    expect(c.querySelector("pre code")?.textContent).toContain("<script>alert(1)</script>");
    expect(c.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("MarkdownContent links", () => {
  it.each([
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x](jav&#x09;ascript:alert(1))",
    "[x](jav&#x0A;ascript:alert(1))",
    "[x](data:text/html;base64,PHNjcmlwdD4=)",
    "[x](vbscript:msgbox(1))",
    "[x](file:///etc/passwd)",
    "[x](tel:+123)",
    "[x](/ruta)",
    "[x](#a)",
    "[x](//evil.com)",
    "[x][1]\n\n[1]: javascript:alert(1)",
  ])("renders no anchor for %j", (md) => {
    const c = renderMd(md);
    expect(c.querySelector("a")).toBeNull();
    expect(c.querySelector("[href]")).toBeNull();
    expect(c.textContent).toContain("x");
  });

  it.each(["https://a.com", "http://a.com"])("renders safe anchor for %s", (url) => {
    const a = renderMd(`[x](${url})`).querySelector("a");
    expect(a?.getAttribute("href")).toBe(url);
    expect(a?.getAttribute("target")).toBe("_blank");
    const rel = a?.getAttribute("rel") ?? "";
    for (const token of ["noopener", "noreferrer", "nofollow", "ugc"]) expect(rel).toContain(token);
  });

  it("mailto gets rel but no target", () => {
    const a = renderMd("[x](mailto:a@b.co)").querySelector("a");
    expect(a?.getAttribute("href")).toBe("mailto:a@b.co");
    expect(a?.getAttribute("target")).toBeNull();
    expect(a?.getAttribute("rel")).toContain("noopener");
  });

  it("autolinks pass through the allowlist", () => {
    const a = renderMd("visita https://a.com ya").querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://a.com");
    expect(a?.getAttribute("rel")).toContain("nofollow");
  });
});

describe("MarkdownContent images", () => {
  it("never renders img and shows the alt text", () => {
    const c = renderMd("![mi logo](https://x.com/p.png)");
    expect(c.querySelector("img")).toBeNull();
    expect(c.textContent).toContain("mi logo");
  });

  it("handles data URI and missing alt", () => {
    const c = renderMd("![](data:image/png;base64,AAAA)\n\n![a](data:image/png;base64,AAAA)");
    expect(c.querySelector("img, [src]")).toBeNull();
    expect(c.textContent?.trim()).toBe("a");
  });

  it("ignores raw HTML img", () => {
    expect(renderMd('<img src="https://x.com/p.png" alt="x">').querySelector("img")).toBeNull();
  });
});
