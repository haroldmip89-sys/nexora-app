CREATE TYPE "public"."connected_account_status" AS ENUM('not_started', 'pending', 'active', 'restricted');--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_account_id" text,
	"status" "connected_account_status" DEFAULT 'not_started' NOT NULL,
	"status_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connected_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "connected_accounts_stripe_account_id_unique" UNIQUE("stripe_account_id"),
	CONSTRAINT "connected_accounts_status_requires_account" CHECK ("connected_accounts"."stripe_account_id" IS NOT NULL OR "connected_accounts"."status" = 'not_started'),
	CONSTRAINT "connected_accounts_stripe_id_format" CHECK ("connected_accounts"."stripe_account_id" IS NULL OR "connected_accounts"."stripe_account_id" LIKE 'acct\_%')
);
--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;