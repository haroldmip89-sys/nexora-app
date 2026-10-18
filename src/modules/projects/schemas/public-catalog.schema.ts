import { z } from "zod";
import { centsToUsd, usdToCents } from "@/lib/money";
import {
  PROJECT_CATEGORIES,
  PROJECT_LIMITS,
  TECHNOLOGY_SLUG_REGEX,
} from "@/modules/projects/schemas/project.schema";
import {
  CATALOG_SORTS,
  CATALOG_WEEK_OPTIONS,
  type CatalogWeeks,
  type PublicCatalogQuery,
} from "@/modules/projects/types/public-project.types";

export const PUBLIC_CATALOG_PAGE_SIZE = 12;

export const PUBLIC_CATALOG_LIMITS = {
  qMaxLength: 80,
  termMaxLength: 40,
  maxTerms: 5,
  maxTechnologies: 5,
  maxPage: 10_000,
} as const;

type RawSearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_QUERY: PublicCatalogQuery = {
  q: "",
  terms: [],
  technologies: [],
  category: "all",
  budgetMaxCents: null,
  weeks: null,
  sort: "recent",
  page: 1,
};

const categorySchema = z.enum(["all", ...PROJECT_CATEGORIES]).catch("all");
const sortSchema = z.enum(CATALOG_SORTS).catch("recent");
const pageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(PUBLIC_CATALOG_LIMITS.maxPage)
  .catch(1);
const weeksSchema = z
  .enum(CATALOG_WEEK_OPTIONS.map(String) as [string, ...string[]])
  .transform((value) => Number(value) as CatalogWeeks)
  .nullable()
  .catch(null);

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function allValues(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function parseTechnologies(raw: string | string[] | undefined): string[] {
  const slugs = new Set<string>();
  for (const value of allValues(raw)) {
    const slug = value.trim().toLowerCase();
    if (slug.length <= PROJECT_LIMITS.technologies.slugMaxLength && TECHNOLOGY_SLUG_REGEX.test(slug)) {
      slugs.add(slug);
    }
  }
  return [...slugs].sort().slice(0, PUBLIC_CATALOG_LIMITS.maxTechnologies);
}

function normalizeQ(raw: string | undefined): { q: string; terms: string[] } {
  const q = (raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PUBLIC_CATALOG_LIMITS.qMaxLength)
    .trim();
  if (q === "") return { q: "", terms: [] };

  const seen = new Set<string>();
  const terms: string[] = [];
  for (const word of q.split(" ")) {
    const term = word.slice(0, PUBLIC_CATALOG_LIMITS.termMaxLength);
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === PUBLIC_CATALOG_LIMITS.maxTerms) break;
  }
  return { q, terms };
}

function parseBudgetMax(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cents = usdToCents(raw);
  if (cents === null) return null;
  const { min, max } = PROJECT_LIMITS.budgetCents;
  return cents >= min && cents <= max ? cents : null;
}

/** Invalid or missing values fall back to defaults; never throws. */
export function parsePublicCatalogQuery(raw: RawSearchParams): PublicCatalogQuery {
  const { q, terms } = normalizeQ(firstValue(raw.q));
  return {
    q,
    terms,
    technologies: parseTechnologies(raw.tech),
    category: categorySchema.parse(firstValue(raw.category)),
    budgetMaxCents: parseBudgetMax(firstValue(raw.budgetMax)),
    weeks: weeksSchema.parse(firstValue(raw.weeks) ?? null),
    sort: sortSchema.parse(firstValue(raw.sort)),
    page: pageSchema.parse(firstValue(raw.page)),
  };
}

/** Escapes `\`, `%` and `_` so user text is matched literally by LIKE/ILIKE. */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Canonical `/projects` URL: omits default values. Changing any filter
 * resets `page` to 1 unless the patch sets `page` explicitly.
 */
export function buildCatalogHref(
  query: PublicCatalogQuery,
  patch: Partial<PublicCatalogQuery> = {},
): string {
  const next: PublicCatalogQuery = { ...query, ...patch };
  if (patch.page === undefined && Object.keys(patch).length > 0) next.page = 1;

  const params = new URLSearchParams();
  if (next.q !== DEFAULT_QUERY.q) params.set("q", next.q);
  for (const slug of [...next.technologies].sort()) params.append("tech", slug);
  if (next.category !== DEFAULT_QUERY.category) params.set("category", next.category);
  if (next.budgetMaxCents !== null) params.set("budgetMax", centsToUsd(next.budgetMaxCents));
  if (next.weeks !== null) params.set("weeks", String(next.weeks));
  if (next.sort !== DEFAULT_QUERY.sort) params.set("sort", next.sort);
  if (next.page !== DEFAULT_QUERY.page) params.set("page", String(next.page));

  const search = params.toString();
  return search === "" ? "/projects" : `/projects?${search}`;
}
