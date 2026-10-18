CREATE TABLE "project_technologies" (
	"project_id" uuid NOT NULL,
	"technology_id" uuid NOT NULL,
	CONSTRAINT "project_technologies_project_id_technology_id_pk" PRIMARY KEY("project_id","technology_id")
);
--> statement-breakpoint
CREATE TABLE "technologies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "technologies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "technologies_slug_format" CHECK ("technologies"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "project_technologies" ADD CONSTRAINT "project_technologies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_technologies" ADD CONSTRAINT "project_technologies_technology_id_technologies_id_fk" FOREIGN KEY ("technology_id") REFERENCES "public"."technologies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_technologies_technology_idx" ON "project_technologies" USING btree ("technology_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "technologies_name_lower_idx" ON "technologies" USING btree (lower("name"));