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

export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "published",
  "proposal_selected",
  "contracted",
  "closed",
]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    budgetMinCents: integer("budget_min_cents").notNull(),
    budgetMaxCents: integer("budget_max_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    timelineWeeks: integer("timeline_weeks").notNull(),
    status: projectStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    contractedAt: timestamp("contracted_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("projects_budget_min_positive", sql`${t.budgetMinCents} > 0`),
    check("projects_budget_range", sql`${t.budgetMaxCents} >= ${t.budgetMinCents}`),
    check("projects_currency_usd", sql`${t.currency} = 'USD'`),
    check("projects_timeline_positive", sql`${t.timelineWeeks} > 0`),
    check(
      "projects_closed_at_matches_status",
      sql`(${t.status} = 'closed') = (${t.closedAt} IS NOT NULL)`,
    ),
    index("projects_catalog_recent_idx")
      .on(t.publishedAt.desc(), t.id.desc())
      .where(sql`${t.status} = 'published'`),
    index("projects_catalog_category_idx")
      .on(t.category, t.publishedAt.desc())
      .where(sql`${t.status} = 'published'`),
    index("projects_client_created_idx").on(t.clientId, t.createdAt.desc()),
  ],
);
