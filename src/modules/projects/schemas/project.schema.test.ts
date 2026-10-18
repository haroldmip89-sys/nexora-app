// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  PROJECT_CATEGORIES,
  readTechnologies,
  parseProjectForm,
  projectInputSchema,
  projectListQuerySchema,
} from "@/modules/projects/schemas/project.schema";

const valid = {
  title: "Tienda online",
  category: "E-commerce",
  description: "d".repeat(30),
  budgetMinCents: 100,
  budgetMaxCents: 200,
  timelineWeeks: 4,
  technologies: ["react"],
};

function issuePaths(input: unknown): string[] {
  const r = projectInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => String(i.path[0]));
}

const ok = (patch: object) => projectInputSchema.safeParse({ ...valid, ...patch }).success;

describe("projectInputSchema", () => {
  it("accepts a valid project and trims text", () => {
    const r = projectInputSchema.parse({ ...valid, title: "  Tienda online  " });
    expect(r.title).toBe("Tienda online");
  });

  it("accepts every category and rejects unknown ones", () => {
    for (const category of PROJECT_CATEGORIES) expect(ok({ category })).toBe(true);
    expect(ok({ category: "Marketing" })).toBe(false);
  });

  it("enforces title 5-120", () => {
    expect(ok({ title: "abcd" })).toBe(false);
    expect(ok({ title: "abcde" })).toBe(true);
    expect(ok({ title: "a".repeat(120) })).toBe(true);
    expect(ok({ title: "a".repeat(121) })).toBe(false);
    expect(ok({ title: "  ab  " })).toBe(false);
  });

  it("enforces description 30-5000", () => {
    expect(ok({ description: "a".repeat(29) })).toBe(false);
    expect(ok({ description: "a".repeat(30) })).toBe(true);
    expect(ok({ description: "a".repeat(5000) })).toBe(true);
    expect(ok({ description: "a".repeat(5001) })).toBe(false);
  });

  it("enforces budget 100-100_000_000 cents, integers", () => {
    expect(ok({ budgetMinCents: 99 })).toBe(false);
    expect(ok({ budgetMinCents: 100 })).toBe(true);
    expect(ok({ budgetMinCents: 100.5 })).toBe(false);
    expect(ok({ budgetMinCents: 100_000_000, budgetMaxCents: 100_000_000 })).toBe(true);
    expect(ok({ budgetMaxCents: 100_000_001 })).toBe(false);
  });

  it("requires max >= min and reports it on budgetMaxCents", () => {
    expect(ok({ budgetMinCents: 500, budgetMaxCents: 500 })).toBe(true);
    expect(issuePaths({ ...valid, budgetMinCents: 500, budgetMaxCents: 499 })).toEqual([
      "budgetMaxCents",
    ]);
  });

  it("enforces timeline 1-104 integer weeks", () => {
    expect(ok({ timelineWeeks: 0 })).toBe(false);
    expect(ok({ timelineWeeks: 1 })).toBe(true);
    expect(ok({ timelineWeeks: 104 })).toBe(true);
    expect(ok({ timelineWeeks: 105 })).toBe(false);
    expect(ok({ timelineWeeks: 2.5 })).toBe(false);
  });

  it("enforces technologies 1-10 slugs", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    expect(ok({ technologies: [] })).toBe(false);
    expect(ok({ technologies: many(1) })).toBe(true);
    expect(ok({ technologies: many(10) })).toBe(true);
    expect(ok({ technologies: many(11) })).toBe(false);
  });

  it("enforces slug format and length, and rejects empty items", () => {
    expect(ok({ technologies: ["c-sharp", "nodejs"] })).toBe(true);
    expect(ok({ technologies: ["a".repeat(40)] })).toBe(true);
    expect(ok({ technologies: ["a".repeat(41)] })).toBe(false);
    for (const bad of ["C#", "a b", "-x", "x-", "a--b", "node.js", "  ", ""]) {
      expect(ok({ technologies: ["react", bad] })).toBe(false);
    }
  });

  it("lowercases, trims and dedupes technologies keeping the first occurrence", () => {
    const r = projectInputSchema.parse({ ...valid, technologies: ["React", " react ", "nodejs", "REACT"] });
    expect(r.technologies).toEqual(["react", "nodejs"]);
  });
});

describe("projectListQuerySchema", () => {
  it("applies defaults for missing or invalid values", () => {
    expect(projectListQuerySchema.parse({})).toEqual({ status: "all", sort: "newest", page: 1 });
    expect(projectListQuerySchema.parse({ status: "x", sort: "y", page: "abc" })).toEqual({
      status: "all",
      sort: "newest",
      page: 1,
    });
    expect(projectListQuerySchema.parse({ page: "0" }).page).toBe(1);
    expect(projectListQuerySchema.parse({ page: "1.5" }).page).toBe(1);
  });

  it("accepts valid values", () => {
    expect(projectListQuerySchema.parse({ status: "draft", sort: "oldest", page: "3" })).toEqual({
      status: "draft",
      sort: "oldest",
      page: 3,
    });
  });
});

describe("parseProjectForm", () => {
  const formOf = (patch: Record<string, string | string[]> & { technologies?: string[] } = {}) => {
    const fd = new FormData();
    const { technologies = ["react", "nodejs", "REACT"], ...rest } = patch;
    const base: Record<string, string> = {
      title: "Tienda online",
      category: "E-commerce",
      description: "d".repeat(30),
      budgetMinUsd: "1500.5",
      budgetMaxUsd: "3000",
      timelineWeeks: "8",
      ...rest,
    };
    for (const [k, v] of Object.entries(base)) fd.set(k, v);
    for (const slug of technologies) fd.append("technologies", slug);
    return fd;
  };

  it("converts USD to cents and reads repeated technologies into a deduped list", () => {
    const r = parseProjectForm(formOf());
    expect(r).toEqual({
      success: true,
      data: {
        title: "Tienda online",
        category: "E-commerce",
        description: "d".repeat(30),
        budgetMinCents: 150050,
        budgetMaxCents: 300000,
        timelineWeeks: 8,
        technologies: ["react", "nodejs"],
      },
    });
  });

  it("ignores extra fields such as status or clientId", () => {
    const r = parseProjectForm(formOf({ status: "published", clientId: "x" }));
    expect(r.success && Object.keys(r.data)).not.toContain("status");
  });

  it("returns UI field keys and submitted values on error", () => {
    const r = parseProjectForm(formOf({ budgetMinUsd: "10.999", budgetMaxUsd: "1,500" }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.fieldErrors.budgetMinUsd).toBeTruthy();
    expect(r.fieldErrors.budgetMaxUsd).toBeTruthy();
    expect(r.fieldErrors).not.toHaveProperty("budgetMinCents");
    expect(r.values.budgetMinUsd).toBe("10.999");
    expect(r.values.title).toBe("Tienda online");
  });

  it("relabels max < min to budgetMaxUsd", () => {
    const r = parseProjectForm(formOf({ budgetMinUsd: "500", budgetMaxUsd: "100" }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(Object.keys(r.fieldErrors)).toEqual(["budgetMaxUsd"]);
  });

  it("does not throw on non-parseable values and reports each field", () => {
    const r = parseProjectForm(
      formOf({ timelineWeeks: "abc", technologies: [], category: "Nope", budgetMinUsd: "-1" }),
    );
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(Object.keys(r.fieldErrors).sort()).toEqual(
      ["budgetMinUsd", "category", "technologies", "timelineWeeks"].sort(),
    );
  });

  it("reports the technologies error with the minimum message when none are sent", () => {
    const r = parseProjectForm(formOf({ technologies: [] }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.fieldErrors.technologies).toBe("Indica al menos una tecnología");
  });

  it("rejects invalid slugs and returns the submitted technologies as an array", () => {
    const r = parseProjectForm(formOf({ technologies: ["react", "C#"], title: "x" }));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.fieldErrors.technologies).toBeTruthy();
    expect(r.values.technologies).toEqual(["react", "C#"]);
  });

  it("handles a completely empty form", () => {
    const r = parseProjectForm(new FormData());
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(Object.keys(r.fieldErrors)).toHaveLength(7);
    expect(r.values.title).toBe("");
  });

  it("enforces budget edges through the form (USD 1 and 1.000.000)", () => {
    expect(parseProjectForm(formOf({ budgetMinUsd: "1", budgetMaxUsd: "1000000" })).success).toBe(true);
    expect(parseProjectForm(formOf({ budgetMinUsd: "0.99" })).success).toBe(false);
    expect(parseProjectForm(formOf({ budgetMaxUsd: "1000000.01" })).success).toBe(false);
  });
});

describe("readTechnologies", () => {
  it("returns every repeated string value and ignores files", () => {
    const fd = new FormData();
    fd.append("technologies", "react");
    fd.append("technologies", "go");
    fd.append("technologies", new Blob(["x"]), "x.txt");
    expect(readTechnologies(fd)).toEqual(["react", "go"]);
    expect(readTechnologies(new FormData())).toEqual([]);
  });
});
