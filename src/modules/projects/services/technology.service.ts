import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db/client";
import { projectTechnologies } from "@/modules/projects/schema/project-technologies.table";
import { technologies } from "@/modules/projects/schema/technologies.table";
import { ProjectError } from "@/modules/projects/services/project-errors";
import type { TechnologyOption } from "@/modules/projects/types/project.types";

type Executor = Pick<typeof db, "select">;
type Writer = Pick<typeof db, "select" | "delete" | "insert">;

/** Whole catalog ordered for display ("Otros" last). Cached per request. */
export const listTechnologies = cache(async (): Promise<TechnologyOption[]> =>
  db
    .select({ slug: technologies.slug, name: technologies.name })
    .from(technologies)
    .orderBy(asc(technologies.sortOrder), asc(technologies.name)),
);

/** Slugs -> ids, same order as received. Throws INVALID_TECHNOLOGY if any slug is not in the catalog. */
export async function resolveTechnologyIds(executor: Executor, slugs: string[]): Promise<string[]> {
  const unique = [...new Set(slugs)];
  if (unique.length === 0) return [];
  const rows = await executor
    .select({ id: technologies.id, slug: technologies.slug })
    .from(technologies)
    .where(inArray(technologies.slug, unique));
  const idBySlug = new Map(rows.map((row) => [row.slug, row.id]));
  return unique.map((slug) => {
    const id = idBySlug.get(slug);
    if (!id) throw new ProjectError("INVALID_TECHNOLOGY");
    return id;
  });
}

/** Replaces the project's tags; must run inside the caller's transaction. */
export async function replaceProjectTechnologies(
  tx: Writer,
  projectId: string,
  slugs: string[],
): Promise<void> {
  const ids = await resolveTechnologyIds(tx, slugs);
  await tx.delete(projectTechnologies).where(eq(projectTechnologies.projectId, projectId));
  if (ids.length > 0) {
    await tx
      .insert(projectTechnologies)
      .values(ids.map((technologyId) => ({ projectId, technologyId })));
  }
}

/** Slugs of the project's tags ordered like the catalog. */
export async function getProjectTechnologySlugs(
  executor: Executor,
  projectId: string,
): Promise<string[]> {
  const rows = await executor
    .select({ slug: technologies.slug })
    .from(projectTechnologies)
    .innerJoin(technologies, eq(technologies.id, projectTechnologies.technologyId))
    .where(eq(projectTechnologies.projectId, projectId))
    .orderBy(asc(technologies.sortOrder), asc(technologies.name));
  return rows.map((row) => row.slug);
}
