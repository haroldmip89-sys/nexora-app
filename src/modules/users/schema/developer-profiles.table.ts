import { sql } from "drizzle-orm";
import { check, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users.table";

export type ProfileLink = { type: "github" | "linkedin" | "portfolio" | "other"; url: string };

export const developerAvailabilityEnum = pgEnum("developer_availability", [
  "available",
  "partial",
  "unavailable",
]);

export const contactVisibilityEnum = pgEnum("contact_visibility", [
  "accepted_client",
  "any_client",
  "nobody",
]);

export const developerProfiles = pgTable(
  "developer_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    headline: text("headline").notNull(),
    bio: text("bio").notNull(),
    technologies: text("technologies")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    externalUrl: text("external_url"),
    location: text("location"),
    availability: developerAvailabilityEnum("availability").notNull().default("available"),
    links: jsonb("links")
      .$type<ProfileLink[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Public contact address; NOT users.email (access email is never exposed).
    contactEmail: text("contact_email"),
    contactVisibility: contactVisibilityEnum("contact_visibility")
      .notNull()
      .default("accepted_client"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("developer_profiles_headline_length", sql`char_length(${t.headline}) <= 80`),
    check("developer_profiles_bio_length", sql`char_length(${t.bio}) <= 5000`),
    check(
      "developer_profiles_location_length",
      sql`${t.location} IS NULL OR char_length(${t.location}) <= 80`,
    ),
    check(
      "developer_profiles_contact_email_length",
      sql`${t.contactEmail} IS NULL OR char_length(${t.contactEmail}) <= 254`,
    ),
    check(
      "developer_profiles_links_shape",
      sql`jsonb_typeof(${t.links}) = 'array' AND jsonb_array_length(${t.links}) <= 5`,
    ),
  ],
);
