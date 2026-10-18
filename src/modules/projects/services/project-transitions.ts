import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { projects } from "@/modules/projects/schema/projects.table";

/**
 * Leaf transition: receives the caller's executor (usually a `tx`) and never imports `db`,
 * `project.service` or anything from `proposals`. Moves `published -> proposal_selected`;
 * returns true only if that row was updated.
 */
export async function markProposalSelected(
  executor: Pick<PgDatabase<PgQueryResultHKT>, "update">,
  projectId: string,
): Promise<boolean> {
  const rows = await executor
    .update(projects)
    .set({ status: "proposal_selected" })
    .where(and(eq(projects.id, projectId), eq(projects.status, "published")))
    .returning({ id: projects.id });
  return rows.length === 1;
}
