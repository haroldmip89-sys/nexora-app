import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { proposals } from "@/modules/proposals/schema/proposals.table";

/**
 * Leaf transition: receives the caller's executor (usually a `tx`) and never imports `db`
 * or anything from `projects`. Returns the number of rows moved to `rejected`.
 */
export async function rejectPendingProposals(
  executor: Pick<PgDatabase<PgQueryResultHKT>, "update">,
  projectId: string,
): Promise<number> {
  const rows = await executor
    .update(proposals)
    .set({ status: "rejected" })
    .where(and(eq(proposals.projectId, projectId), eq(proposals.status, "pending")))
    .returning({ id: proposals.id });
  return rows.length;
}

/**
 * Leaf transition: `pending -> accepted` for one proposal of the given project.
 * Returns true only if exactly that pending row was updated.
 */
export async function acceptPendingProposal(
  executor: Pick<PgDatabase<PgQueryResultHKT>, "update">,
  { proposalId, projectId }: { proposalId: string; projectId: string },
): Promise<boolean> {
  const rows = await executor
    .update(proposals)
    .set({ status: "accepted" })
    .where(
      and(
        eq(proposals.id, proposalId),
        eq(proposals.projectId, projectId),
        eq(proposals.status, "pending"),
      ),
    )
    .returning({ id: proposals.id });
  return rows.length === 1;
}
