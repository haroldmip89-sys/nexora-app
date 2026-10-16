import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { projects } from "../../projects/schema/projects.table";
import { users } from "../../users/schema/users.table";

export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "accepted",
  "rejected",
  "withdrawn",
]);

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    timelineWeeks: integer("timeline_weeks").notNull(),
    description: text("description").notNull(),
    status: proposalStatusEnum("status").notNull().default("pending"),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("proposals_price_positive", sql`${t.priceCents} > 0`),
    check("proposals_currency_usd", sql`${t.currency} = 'USD'`),
    check("proposals_timeline_positive", sql`${t.timelineWeeks} > 0`),
    unique("proposals_project_developer_unique").on(t.projectId, t.developerId),
    unique("proposals_id_project_unique").on(t.id, t.projectId),
    uniqueIndex("proposals_one_accepted_per_project_idx")
      .on(t.projectId)
      .where(sql`${t.status} = 'accepted'`),
    index("proposals_developer_created_idx").on(t.developerId, t.createdAt.desc()),
  ],
);
