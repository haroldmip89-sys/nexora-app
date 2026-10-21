import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AuthError } from "@/modules/auth/services/auth-errors";
import { can } from "@/modules/auth/services/permissions";
import type { AuthUser } from "@/modules/auth/types/auth.types";
import { developerTransfers } from "@/modules/payments/schema/developer-transfers.table";
import { paymentAttempts } from "@/modules/payments/schema/payment-attempts.table";
import type {
  DeveloperTransferItem,
  TransferReason,
} from "@/modules/payments/types/developer-transfer.types";
import { projects } from "@/modules/projects/schema/projects.table";

/**
 * Read-only list of the developer's own test transfers (spec 011b RF4). No Stripe, no writes.
 * Explicit projection: no Stripe ids, client data or attempt ids.
 */
export async function getDeveloperTransfers(actor: AuthUser): Promise<DeveloperTransferItem[]> {
  if (!can(actor.role, "payout.manage")) throw new AuthError("FORBIDDEN");

  const rows = await db
    .select({
      id: developerTransfers.id,
      projectTitle: projects.title,
      amountCents: developerTransfers.amountCents,
      status: developerTransfers.status,
      reason: developerTransfers.lastErrorCode,
      createdAt: developerTransfers.createdAt,
      completedAt: developerTransfers.completedAt,
    })
    .from(developerTransfers)
    .innerJoin(paymentAttempts, eq(paymentAttempts.id, developerTransfers.paymentAttemptId))
    .innerJoin(projects, eq(projects.id, paymentAttempts.projectId))
    .where(eq(developerTransfers.developerId, actor.id))
    .orderBy(desc(developerTransfers.createdAt), desc(developerTransfers.id));

  return rows.map((row) => ({ ...row, reason: row.reason as TransferReason | null }));
}
