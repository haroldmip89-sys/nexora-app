CREATE TYPE "public"."contact_visibility" AS ENUM('accepted_client', 'any_client', 'nobody');--> statement-breakpoint
CREATE TYPE "public"."developer_availability" AS ENUM('available', 'partial', 'unavailable');--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD COLUMN "availability" "developer_availability" DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD COLUMN "contact_visibility" "contact_visibility" DEFAULT 'accepted_client' NOT NULL;--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_headline_length" CHECK (char_length("developer_profiles"."headline") <= 80);--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_bio_length" CHECK (char_length("developer_profiles"."bio") <= 1000);--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_location_length" CHECK ("developer_profiles"."location" IS NULL OR char_length("developer_profiles"."location") <= 80);--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_contact_email_length" CHECK ("developer_profiles"."contact_email" IS NULL OR char_length("developer_profiles"."contact_email") <= 254);--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_links_shape" CHECK (jsonb_typeof("developer_profiles"."links") = 'array' AND jsonb_array_length("developer_profiles"."links") <= 5);