CREATE TYPE "public"."revision_status" AS ENUM('draft', 'in-progress', 'review', 'approved', 'locked');--> statement-breakpoint
CREATE TABLE "bom_line" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"unit_price_snapshot" numeric(12, 4) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"letter" text NOT NULL,
	"status" "revision_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"locked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"owner_id" text,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"target_date" date,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_revision_id_bom_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."bom_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_item_id_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD CONSTRAINT "bom_revision_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bom_line_rev_item_uq" ON "bom_line" USING btree ("revision_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bom_rev_project_letter_uq" ON "bom_revision" USING btree ("project_id","letter");--> statement-breakpoint
CREATE INDEX "project_org_code_idx" ON "project" USING btree ("organization_id","code");