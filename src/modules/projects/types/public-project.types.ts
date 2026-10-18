import type { Role } from "@/modules/auth/types/auth.types";
import type { PROJECT_CATEGORIES } from "@/modules/projects/schemas/project.schema";

/** Allowed "up to N weeks" thresholds of the catalog timeline filter. */
export const CATALOG_WEEK_OPTIONS = [4, 8, 12, 26] as const;

export const CATALOG_SORTS = ["recent", "budget_asc", "budget_desc"] as const;

export type CatalogWeeks = (typeof CATALOG_WEEK_OPTIONS)[number];
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/** Parsed and validated `searchParams` of `/projects`. */
export type PublicCatalogQuery = {
  q: string;
  terms: string[];
  /** Catalog slugs; a project must have all of them (AND). */
  technologies: string[];
  category: "all" | (typeof PROJECT_CATEGORIES)[number];
  budgetMaxCents: number | null;
  weeks: CatalogWeeks | null;
  sort: CatalogSort;
  page: number;
};

/** Catalog card. Whitelist: no clientId, status, currency, internal dates or user data. */
export type PublicProjectSummary = {
  id: string;
  title: string;
  category: string;
  summary: string;
  budgetMinCents: number;
  budgetMaxCents: number;
  timelineWeeks: number;
  /** Catalog names ordered by sort_order, name. */
  technologies: string[];
  publishedAt: Date | null;
};

/** Public detail; same whitelist, full description instead of summary. */
export type PublicProject = Omit<PublicProjectSummary, "summary"> & {
  description: string;
};

export type PublicCatalogPage = {
  items: PublicProjectSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PublicViewer =
  | { kind: "visitor" }
  | { kind: "needs_onboarding" }
  | { kind: "user"; role: Role; isOwner: boolean };
