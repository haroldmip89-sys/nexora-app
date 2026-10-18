CREATE TABLE "developer_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developer_ratings_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "developer_ratings_rating_range" CHECK ("developer_ratings"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "developer_ratings_comment_length" CHECK ("developer_ratings"."comment" IS NULL OR char_length("developer_ratings"."comment") BETWEEN 1 AND 600)
);
--> statement-breakpoint
ALTER TABLE "developer_ratings" ADD CONSTRAINT "developer_ratings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_ratings" ADD CONSTRAINT "developer_ratings_proposal_project_fk" FOREIGN KEY ("proposal_id","project_id") REFERENCES "public"."proposals"("id","project_id") ON DELETE restrict ON UPDATE no action;