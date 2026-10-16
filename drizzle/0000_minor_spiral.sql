CREATE TYPE "public"."payment_attempt_status" AS ENUM('pending', 'completed_test', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."processed_event_result" AS ENUM('applied', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'published', 'proposal_selected', 'contracted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'accepted', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('client', 'developer', 'admin');--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'pending' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"livemode" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "payment_attempts_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "payment_attempts_amount_positive" CHECK ("payment_attempts"."amount_cents" > 0),
	CONSTRAINT "payment_attempts_currency_usd" CHECK ("payment_attempts"."currency" = 'USD'),
	CONSTRAINT "payment_attempts_livemode_false" CHECK ("payment_attempts"."livemode" = false),
	CONSTRAINT "payment_attempts_completed_at_consistent" CHECK (("payment_attempts"."status" = 'completed_test') = ("payment_attempts"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "processed_payment_events" (
	"stripe_event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payment_attempt_id" uuid,
	"result" "processed_event_result" NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"budget_min_cents" integer NOT NULL,
	"budget_max_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"timeline_weeks" integer NOT NULL,
	"technologies" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"contracted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_budget_min_positive" CHECK ("projects"."budget_min_cents" > 0),
	CONSTRAINT "projects_budget_range" CHECK ("projects"."budget_max_cents" >= "projects"."budget_min_cents"),
	CONSTRAINT "projects_currency_usd" CHECK ("projects"."currency" = 'USD'),
	CONSTRAINT "projects_timeline_positive" CHECK ("projects"."timeline_weeks" > 0),
	CONSTRAINT "projects_closed_at_matches_status" CHECK (("projects"."status" = 'closed') = ("projects"."closed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "proposal_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"selected_by" uuid NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_selections_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "proposal_selections_proposal_id_unique" UNIQUE("proposal_id")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"developer_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"timeline_weeks" integer NOT NULL,
	"description" text NOT NULL,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_project_developer_unique" UNIQUE("project_id","developer_id"),
	CONSTRAINT "proposals_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "proposals_price_positive" CHECK ("proposals"."price_cents" > 0),
	CONSTRAINT "proposals_currency_usd" CHECK ("proposals"."currency" = 'USD'),
	CONSTRAINT "proposals_timeline_positive" CHECK ("proposals"."timeline_weeks" > 0)
);
--> statement-breakpoint
CREATE TABLE "developer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"headline" text NOT NULL,
	"bio" text NOT NULL,
	"technologies" text[] DEFAULT '{}'::text[] NOT NULL,
	"external_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"role" "user_role" NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_proposal_project_fk" FOREIGN KEY ("proposal_id","project_id") REFERENCES "public"."proposals"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_payment_events" ADD CONSTRAINT "processed_payment_events_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_selections" ADD CONSTRAINT "proposal_selections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_selections" ADD CONSTRAINT "proposal_selections_selected_by_users_id_fk" FOREIGN KEY ("selected_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_selections" ADD CONSTRAINT "proposal_selections_proposal_project_fk" FOREIGN KEY ("proposal_id","project_id") REFERENCES "public"."proposals"("id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_developer_id_users_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_one_active_per_project_idx" ON "payment_attempts" USING btree ("project_id") WHERE "payment_attempts"."status" IN ('pending', 'completed_test');--> statement-breakpoint
CREATE INDEX "payment_attempts_project_created_idx" ON "payment_attempts" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "projects_catalog_recent_idx" ON "projects" USING btree ("published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "projects"."status" = 'published';--> statement-breakpoint
CREATE INDEX "projects_catalog_category_idx" ON "projects" USING btree ("category","published_at" DESC NULLS LAST) WHERE "projects"."status" = 'published';--> statement-breakpoint
CREATE INDEX "projects_client_created_idx" ON "projects" USING btree ("client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_one_accepted_per_project_idx" ON "proposals" USING btree ("project_id") WHERE "proposals"."status" = 'accepted';--> statement-breakpoint
CREATE INDEX "proposals_developer_created_idx" ON "proposals" USING btree ("developer_id","created_at" DESC NULLS LAST);