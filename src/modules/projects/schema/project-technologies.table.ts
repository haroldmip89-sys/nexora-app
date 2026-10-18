import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";

import { projects } from "./projects.table";
import { technologies } from "./technologies.table";

export const projectTechnologies = pgTable(
  "project_technologies",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    technologyId: uuid("technology_id")
      .notNull()
      .references(() => technologies.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.technologyId] }),
    index("project_technologies_technology_idx").on(t.technologyId, t.projectId),
  ],
);
