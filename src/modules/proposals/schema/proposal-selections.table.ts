import { foreignKey, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { projects } from "../../projects/schema/projects.table";
import { users } from "../../users/schema/users.table";
import { proposals } from "./proposals.table";

export const proposalSelections = pgTable(
  "proposal_selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: "restrict" }),
    proposalId: uuid("proposal_id").notNull().unique(),
    selectedBy: uuid("selected_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "proposal_selections_proposal_project_fk",
      columns: [t.proposalId, t.projectId],
      foreignColumns: [proposals.id, proposals.projectId],
    }).onDelete("restrict"),
  ],
);
