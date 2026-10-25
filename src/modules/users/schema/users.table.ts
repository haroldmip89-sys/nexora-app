import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["client", "developer", "admin"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    role: userRoleEnum("role").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    // Copy of the Clerk profile photo URL (developers only). Host is validated in code.
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "users_image_url_format",
      sql`${t.imageUrl} IS NULL OR (${t.imageUrl} LIKE 'https://%' AND char_length(${t.imageUrl}) <= 2048)`,
    ),
  ],
);
