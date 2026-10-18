import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "../../users/schema/users.table";

export const connectedAccountStatusEnum = pgEnum("connected_account_status", [
  "not_started",
  "pending",
  "active",
  "restricted",
]);

export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "restrict" }),
    // NULL until Stripe creates the account.
    stripeAccountId: text("stripe_account_id").unique(),
    // Derived cache of the Stripe account state.
    status: connectedAccountStatusEnum("status").notNull().default("not_started"),
    // Last time the state was read from Stripe.
    statusSyncedAt: timestamp("status_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "connected_accounts_status_requires_account",
      sql`${t.stripeAccountId} IS NOT NULL OR ${t.status} = 'not_started'`,
    ),
    check(
      "connected_accounts_stripe_id_format",
      sql`${t.stripeAccountId} IS NULL OR ${t.stripeAccountId} LIKE 'acct\\_%'`,
    ),
  ],
);
