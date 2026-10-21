CREATE TYPE "public"."developer_transfer_status" AS ENUM('pending', 'completed_test', 'failed');--> statement-breakpoint
CREATE TABLE "developer_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_attempt_id" uuid NOT NULL,
	"developer_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" "developer_transfer_status" DEFAULT 'pending' NOT NULL,
	"stripe_transfer_id" text,
	"retry_generation" integer DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error_code" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developer_transfers_payment_attempt_id_unique" UNIQUE("payment_attempt_id"),
	CONSTRAINT "developer_transfers_stripe_transfer_id_unique" UNIQUE("stripe_transfer_id"),
	CONSTRAINT "developer_transfers_amount_positive" CHECK ("developer_transfers"."amount_cents" > 0),
	CONSTRAINT "developer_transfers_currency_usd" CHECK ("developer_transfers"."currency" = 'USD'),
	CONSTRAINT "developer_transfers_counters_non_negative" CHECK ("developer_transfers"."retry_generation" >= 0 AND "developer_transfers"."attempt_count" >= 0),
	CONSTRAINT "developer_transfers_stripe_id_consistent" CHECK (("developer_transfers"."status" = 'completed_test') = ("developer_transfers"."stripe_transfer_id" IS NOT NULL)),
	CONSTRAINT "developer_transfers_stripe_id_format" CHECK ("developer_transfers"."stripe_transfer_id" IS NULL OR "developer_transfers"."stripe_transfer_id" LIKE 'tr\_%'),
	CONSTRAINT "developer_transfers_completed_at_consistent" CHECK (("developer_transfers"."status" = 'completed_test') = ("developer_transfers"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "developer_transfers" ADD CONSTRAINT "developer_transfers_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_transfers" ADD CONSTRAINT "developer_transfers_developer_id_users_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "developer_transfers_developer_status_idx" ON "developer_transfers" USING btree ("developer_id","status");