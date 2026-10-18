import "server-only";
import { and, asc, desc, eq, ilike, notInArray, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { summarizeMarkdown } from "@/lib/markdown";
import { projects } from "@/modules/projects/schema/projects.table";
import { PROJECT_CATEGORIES } from "@/modules/projects/schemas/project.schema";
import {
  escapeLikeTerm,
  PUBLIC_CATALOG_PAGE_SIZE,
} from "@/modules/projects/schemas/public-catalog.schema";
import type {
  PublicCatalogPage,
  PublicCatalogQuery,
  PublicProject,
  PublicProjectSummary,
} from "@/modules/projects/types/public-project.types";

export { PUBLIC_CATALOG_PAGE_SIZE };

const SUMMARY_LENGTH = 240;

/** Single visibility predicate shared by list, count and detail. */
const isPublished = eq(projects.status, "published");

const technologyNamesSql = sql<string[]>`coalesce(array(select t."name" from "project_technologies" pt join "technologies" t on t."id" = pt."technology_id" where pt."project_id" = "projects"."id" order by t."sort_order", t."name"), '{}')`;

/** Projects having ALL the given slugs (AND). Slugs are always bound parameters. */
function technologiesFilter(slugs: string[]): SQL {
  return sql`"projects"."id" in (select pt."project_id" from "project_technologies" pt join "technologies" t on t."id" = pt."technology_id" where t."slug" in (${sql.join(
    slugs.map((slug) => sql`${slug}`),
    sql`, `,
  )}) group by pt."project_id" having count(*) = ${slugs.length})`;
}

function termFilter(term: string): SQL {
  const pattern = `%${escapeLikeTerm(term)}%`;
  return or(
    ilike(projects.title, pattern),
    ilike(projects.description, pattern),
    sql`exists (select 1 from "project_technologies" pt join "technologies" t on t."id" = pt."technology_id" where pt."project_id" = "projects"."id" and t."name" ilike ${pattern})`,
  ) as SQL;
}

function buildWhere(query: PublicCatalogQuery): SQL {
  const conditions: (SQL | undefined)[] = [isPublished];

  if (query.category !== "all") {
    conditions.push(
      query.category === "Otros"
        ? or(eq(projects.category, "Otros"), notInArray(projects.category, [...PROJECT_CATEGORIES]))
        : eq(projects.category, query.category),
    );
  }
  if (query.budgetMaxCents !== null) {
    conditions.push(sql`"projects"."budget_max_cents" <= ${query.budgetMaxCents}`);
  }
  if (query.weeks !== null) {
    conditions.push(sql`"projects"."timeline_weeks" <= ${query.weeks}`);
  }
  if (query.technologies.length > 0) conditions.push(technologiesFilter(query.technologies));
  for (const term of query.terms) conditions.push(termFilter(term));

  return and(...conditions) as SQL;
}

function buildOrder(sort: PublicCatalogQuery["sort"]) {
  switch (sort) {
    case "budget_asc":
      return [asc(projects.budgetMaxCents), desc(projects.publishedAt), desc(projects.id)];
    case "budget_desc":
      return [desc(projects.budgetMaxCents), desc(projects.publishedAt), desc(projects.id)];
    default:
      return [desc(projects.publishedAt), desc(projects.id)];
  }
}

export async function listPublicProjects(query: PublicCatalogQuery): Promise<PublicCatalogPage> {
  const where = buildWhere(query);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(projects)
    .where(where);

  // The summary is built from the full description (max 5000 chars): cutting the
  // Markdown in SQL could split a syntax token and leak symbols into the plain text.
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      category: projects.category,
      description: projects.description,
      budgetMinCents: projects.budgetMinCents,
      budgetMaxCents: projects.budgetMaxCents,
      timelineWeeks: projects.timelineWeeks,
      technologies: technologyNamesSql,
      publishedAt: projects.publishedAt,
    })
    .from(projects)
    .where(where)
    .orderBy(...buildOrder(query.sort))
    .limit(PUBLIC_CATALOG_PAGE_SIZE)
    .offset((query.page - 1) * PUBLIC_CATALOG_PAGE_SIZE);

  const items: PublicProjectSummary[] = rows.map(({ description, ...rest }) => ({
    ...rest,
    summary: summarizeMarkdown(description, SUMMARY_LENGTH),
  }));

  return {
    items,
    total,
    page: query.page,
    pageSize: PUBLIC_CATALOG_PAGE_SIZE,
    totalPages: Math.ceil(total / PUBLIC_CATALOG_PAGE_SIZE),
  };
}

const idSchema = z.uuid();

/** null = missing, not published or malformed id (indistinguishable on purpose). */
export const getPublicProject = cache(async (id: string): Promise<PublicProject | null> => {
  if (!idSchema.safeParse(id).success) return null;
  const [row] = await db
    .select({
      id: projects.id,
      title: projects.title,
      category: projects.category,
      description: projects.description,
      budgetMinCents: projects.budgetMinCents,
      budgetMaxCents: projects.budgetMaxCents,
      timelineWeeks: projects.timelineWeeks,
      technologies: technologyNamesSql,
      publishedAt: projects.publishedAt,
    })
    .from(projects)
    .where(and(eq(projects.id, id), isPublished))
    .limit(1);
  return row ?? null;
});

/** Boolean only: clientId never leaves the service. */
export async function isProjectOwner(projectId: string, userId: string): Promise<boolean> {
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(userId).success) return false;
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.clientId, userId)))
    .limit(1);
  return Boolean(row);
}
