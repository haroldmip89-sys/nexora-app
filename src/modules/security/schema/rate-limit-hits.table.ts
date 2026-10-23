import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })],
);
