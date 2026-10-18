// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildCatalogHref,
  escapeLikeTerm,
  parsePublicCatalogQuery,
} from "@/modules/projects/schemas/public-catalog.schema";
import { PROJECT_CATEGORIES } from "@/modules/projects/schemas/project.schema";
import type {
  PublicProject,
  PublicProjectSummary,
} from "@/modules/projects/types/public-project.types";

const DEFAULTS = {
  q: "",
  terms: [],
  technologies: [],
  category: "all",
  budgetMaxCents: null,
  weeks: null,
  sort: "recent",
  page: 1,
};

describe("parsePublicCatalogQuery", () => {
  it("returns defaults for empty input", () => {
    expect(parsePublicCatalogQuery({})).toEqual(DEFAULTS);
  });

  it("accepts valid values", () => {
    expect(
      parsePublicCatalogQuery({
        q: "react api",
        category: "Backend & APIs",
        budgetMax: "1500.5",
        weeks: "12",
        sort: "budget_desc",
        page: "3",
      }),
    ).toEqual({
      q: "react api",
      terms: ["react", "api"],
      technologies: [],
      category: "Backend & APIs",
      budgetMaxCents: 150050,
      weeks: 12,
      sort: "budget_desc",
      page: 3,
    });
  });

  it("accepts every listed category and every week threshold", () => {
    for (const category of PROJECT_CATEGORIES) {
      expect(parsePublicCatalogQuery({ category }).category).toBe(category);
    }
    for (const weeks of [4, 8, 12, 26]) {
      expect(parsePublicCatalogQuery({ weeks: String(weeks) }).weeks).toBe(weeks);
    }
  });

  it("takes the first value of repeated params", () => {
    const query = parsePublicCatalogQuery({ category: ["Full Stack", "WordPress"], q: ["a", "b"] });
    expect(query.category).toBe("Full Stack");
    expect(query.q).toBe("a");
  });

  it("falls back to defaults for invalid category, sort and weeks", () => {
    const query = parsePublicCatalogQuery({ category: "Histórica", sort: "foo", weeks: "7" });
    expect(query.category).toBe("all");
    expect(query.sort).toBe("recent");
    expect(query.weeks).toBeNull();
    expect(parsePublicCatalogQuery({ weeks: "abc" }).weeks).toBeNull();
    expect(parsePublicCatalogQuery({ weeks: "" }).weeks).toBeNull();
  });

  it.each(["1500", "1500.5", "1", "1000000"])("accepts budgetMax %s", (value) => {
    expect(parsePublicCatalogQuery({ budgetMax: value }).budgetMaxCents).not.toBeNull();
  });

  it.each(["abc", "1,5", "-1", "1e3", "0.001", "", "0", "0.99", "1000000.01", "99999999999999999999"])(
    "ignores invalid or out-of-range budgetMax %j",
    (value) => {
      expect(parsePublicCatalogQuery({ budgetMax: value }).budgetMaxCents).toBeNull();
    },
  );

  it.each(["0", "-1", "-3", "abc", "1.5", "", "10001", "999999"])("falls back to page 1 for %j", (value) => {
    expect(parsePublicCatalogQuery({ page: value }).page).toBe(1);
  });

  it("accepts page limits", () => {
    expect(parsePublicCatalogQuery({ page: "1" }).page).toBe(1);
    expect(parsePublicCatalogQuery({ page: "10000" }).page).toBe(10000);
  });

  describe("q", () => {
    it("trims and collapses whitespace", () => {
      const query = parsePublicCatalogQuery({ q: "  react    native  " });
      expect(query.q).toBe("react native");
      expect(query.terms).toEqual(["react", "native"]);
    });

    it("treats only spaces as no filter", () => {
      expect(parsePublicCatalogQuery({ q: "    " })).toEqual(DEFAULTS);
    });

    it("truncates a very long q to 80 characters", () => {
      const query = parsePublicCatalogQuery({ q: "a".repeat(200) });
      expect(query.q).toHaveLength(80);
      expect(query.terms).toEqual(["a".repeat(40)]);
    });

    it("keeps q of exactly 80 characters", () => {
      expect(parsePublicCatalogQuery({ q: "ab ".repeat(26) + "ab" }).q).toHaveLength(80);
    });

    it("keeps at most 5 unique terms, case-insensitive", () => {
      const query = parsePublicCatalogQuery({ q: "A a b c d e f g" });
      expect(query.terms).toEqual(["A", "b", "c", "d", "e"]);
    });

    it("keeps wildcard-only text as literal terms", () => {
      expect(parsePublicCatalogQuery({ q: "% _ \\" }).terms).toEqual(["%", "_", "\\"]);
    });
  });
});

describe("escapeLikeTerm", () => {
  it("escapes backslash, percent and underscore", () => {
    expect(escapeLikeTerm("100%")).toBe("100\\%");
    expect(escapeLikeTerm("a_b")).toBe("a\\_b");
    expect(escapeLikeTerm("a\\b")).toBe("a\\\\b");
    expect(escapeLikeTerm("%_\\")).toBe("\\%\\_\\\\");
  });

  it("leaves plain text untouched", () => {
    expect(escapeLikeTerm("Node.js")).toBe("Node.js");
  });
});

describe("parsePublicCatalogQuery technologies (tech)", () => {
  it("defaults to an empty list", () => {
    expect(parsePublicCatalogQuery({}).technologies).toEqual([]);
  });

  it("accepts a single value and an array", () => {
    expect(parsePublicCatalogQuery({ tech: "react" }).technologies).toEqual(["react"]);
    expect(parsePublicCatalogQuery({ tech: ["react", "nodejs"] }).technologies).toEqual(["nodejs", "react"]);
  });

  it("trims, lowercases, dedupes and sorts", () => {
    expect(parsePublicCatalogQuery({ tech: [" React ", "react", "C-Sharp", "go"] }).technologies).toEqual([
      "c-sharp",
      "go",
      "react",
    ]);
  });

  it("drops invalid formats and over-long values", () => {
    expect(parsePublicCatalogQuery({ tech: ["C#", "a b", "-x", "", "a".repeat(41), "go"] }).technologies).toEqual(["go"]);
  });

  it("keeps at most 5 slugs", () => {
    const tech = ["a", "b", "c", "d", "e", "f", "g"];
    expect(parsePublicCatalogQuery({ tech }).technologies).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("buildCatalogHref", () => {
  const base = parsePublicCatalogQuery({});

  it("omits defaults", () => {
    expect(buildCatalogHref(base)).toBe("/projects");
  });

  it("uses the exact param keys", () => {
    const query = parsePublicCatalogQuery({
      q: "react",
      category: "Full Stack",
      budgetMax: "2000",
      weeks: "8",
      sort: "budget_asc",
      page: "2",
    });
    const params = new URL(buildCatalogHref(query), "http://x").searchParams;
    expect([...params.keys()]).toEqual(["q", "category", "budgetMax", "weeks", "sort", "page"]);
    expect(params.get("budgetMax")).toBe("2000.00");
  });

  it("emits repeated canonical tech params, omits them when empty and resets page", () => {
    const query = parsePublicCatalogQuery({ tech: ["react", "go"], page: "3" });
    expect(buildCatalogHref(query, { page: 3 })).toBe("/projects?tech=go&tech=react&page=3");
    expect(buildCatalogHref(query, { technologies: ["nodejs", "go"] })).toBe("/projects?tech=go&tech=nodejs");
    expect(buildCatalogHref(query, { technologies: [] })).toBe("/projects");
  });

  it("resets page to 1 when a filter changes", () => {
    const query = parsePublicCatalogQuery({ page: "4", category: "WordPress" });
    expect(buildCatalogHref(query, { sort: "budget_asc" })).toBe("/projects?category=WordPress&sort=budget_asc");
    expect(buildCatalogHref(query, { category: "all" })).toBe("/projects");
  });

  it("keeps an explicit page in the patch", () => {
    expect(buildCatalogHref(base, { page: 3 })).toBe("/projects?page=3");
    expect(buildCatalogHref(parsePublicCatalogQuery({ page: "3" }))).toBe("/projects?page=3");
  });

  it("encodes special characters in the category", () => {
    const href = buildCatalogHref(base, { category: "Frontend & UI/UX" });
    expect(href).not.toContain("& ");
    expect(new URL(href, "http://x").searchParams.get("category")).toBe("Frontend & UI/UX");
  });

  it.each([
    { q: "react 100%", category: "Frontend & UI/UX", budgetMax: "1500.50", weeks: "26", sort: "budget_desc", page: "2" },
    { q: "a_b \\ c", weeks: "4" },
    {},
  ])("round-trips with parsePublicCatalogQuery %j", (raw) => {
    const query = parsePublicCatalogQuery(raw);
    const href = buildCatalogHref(query);
    const params = new URL(href, "http://x").searchParams;
    const search: Record<string, string | string[]> = Object.fromEntries(params);
    if (params.has("tech")) search.tech = params.getAll("tech");
    expect(parsePublicCatalogQuery(search)).toEqual(query);
  });
});

describe("public project types", () => {
  it("expose no private fields", () => {
    const summary: Record<keyof PublicProjectSummary, true> = {
      id: true,
      title: true,
      category: true,
      summary: true,
      budgetMinCents: true,
      budgetMaxCents: true,
      timelineWeeks: true,
      technologies: true,
      publishedAt: true,
    };
    const detail: Record<keyof PublicProject, true> = {
      id: true,
      title: true,
      category: true,
      description: true,
      budgetMinCents: true,
      budgetMaxCents: true,
      timelineWeeks: true,
      technologies: true,
      publishedAt: true,
    };
    const forbidden = ["clientId", "status", "currency", "createdAt", "updatedAt", "closedAt", "contractedAt", "email"];
    for (const key of forbidden) {
      expect(Object.keys(summary)).not.toContain(key);
      expect(Object.keys(detail)).not.toContain(key);
    }
  });
});
