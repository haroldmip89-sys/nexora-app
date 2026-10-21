import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "../../users/schema/users.table";
import { paymentAttempts } from "./payment-attempts.table";

export const developerTransferStatusEnum = pgEnum("developer_transfer_status", [
  "pending",
  "completed_test",
  "failed",
]);

export const developerTransfers = pgTable(
  "developer_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentAttemptId: uuid("payment_attempt_id")
      .notNull()
      .unique()
      .references(() => paymentAttempts.id, { onDelete: "restrict" }),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Copied from the attempt (full amount, no fee). */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: developerTransferStatusEnum("status").notNull().default("pending"),
    /** NULL until Stripe creates the transfer. */
    stripeTransferId: text("stripe_transfer_id").unique(),
    /** Part of the Stripe idempotency key. */
    retryGeneration: integer("retry_generation").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    /** Own error code; never Stripe's message. */
    lastErrorCode: text("last_error_code"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("developer_transfers_amount_positive", sql`${t.amountCents} > 0`),
    check("developer_transfers_currency_usd", sql`${t.currency} = 'USD'`),
    check(
      "developer_transfers_counters_non_negative",
      sql`${t.retryGeneration} >= 0 AND ${t.attemptCount} >= 0`,
    ),
    check(
      "developer_transfers_stripe_id_consistent",
      sql`(${t.status} = 'completed_test') = (${t.stripeTransferId} IS NOT NULL)`,
    ),
    check(
      "developer_transfers_stripe_id_format",
      sql`${t.stripeTransferId} IS NULL OR ${t.stripeTransferId} LIKE 'tr\\_%'`,
    ),
    check(
      "developer_transfers_completed_at_consistent",
      sql`(${t.status} = 'completed_test') = (${t.completedAt} IS NOT NULL)`,
    ),
    index("developer_transfers_developer_status_idx").on(t.developerId, t.status),
  ],
);
