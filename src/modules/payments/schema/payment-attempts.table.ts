import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { projects } from "../../projects/schema/projects.table";
import { proposals } from "../../proposals/schema/proposals.table";
import { users } from "../../users/schema/users.table";

export const paymentAttemptStatusEnum = pgEnum("payment_attempt_status", [
  "pending",
  "completed_test",
  "failed",
  "canceled",
]);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    proposalId: uuid("proposal_id").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: paymentAttemptStatusEnum("status").notNull().default("pending"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    livemode: boolean("livemode").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: "payment_attempts_proposal_project_fk",
      columns: [t.proposalId, t.projectId],
      foreignColumns: [proposals.id, proposals.projectId],
    }).onDelete("restrict"),
    check("payment_attempts_amount_positive", sql`${t.amountCents} > 0`),
    check("payment_attempts_currency_usd", sql`${t.currency} = 'USD'`),
    check("payment_attempts_livemode_false", sql`${t.livemode} = false`),
    check(
      "payment_attempts_completed_at_consistent",
      sql`(${t.status} = 'completed_test') = (${t.completedAt} IS NOT NULL)`,
    ),
    uniqueIndex("payment_attempts_one_active_per_project_idx")
      .on(t.projectId)
      .where(sql`${t.status} IN ('pending', 'completed_test')`),
    index("payment_attempts_project_created_idx").on(t.projectId, t.createdAt.desc()),
  ],
);
