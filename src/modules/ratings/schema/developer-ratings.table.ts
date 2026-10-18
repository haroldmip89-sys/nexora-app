import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { projects } from "../../projects/schema/projects.table";
import { proposals } from "../../proposals/schema/proposals.table";

export const developerRatings = pgTable(
  "developer_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // One rating per project.
    projectId: uuid("project_id")
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: "restrict" }),
    // The accepted proposal of the project (developer is derived by join).
    proposalId: uuid("proposal_id").notNull(),
    rating: integer("rating").notNull(),
    // NULL when there is no comment.
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("developer_ratings_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
    check(
      "developer_ratings_comment_length",
      sql`${t.comment} IS NULL OR char_length(${t.comment}) BETWEEN 1 AND 600`,
    ),
    foreignKey({
      name: "developer_ratings_proposal_project_fk",
      columns: [t.proposalId, t.projectId],
      foreignColumns: [proposals.id, proposals.projectId],
    }).onDelete("restrict"),
  ],
);
