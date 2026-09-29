ALTER TYPE "public"."audit_kind" ADD VALUE 'project.updated';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'project.contact.changed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'project.milestone.changed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'project.disciplines.changed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'dashboard.report.exported';--> statement-breakpoint
CREATE TABLE "project_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"company" text,
	"phone" text,
	"email" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_discipline" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"discipline_id" text NOT NULL,
	"lead_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"due_date" date NOT NULL,
	"done_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "contract_no" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "site_address" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "project_contact" ADD CONSTRAINT "project_contact_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_discipline" ADD CONSTRAINT "project_discipline_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_discipline" ADD CONSTRAINT "project_discipline_discipline_id_drawing_discipline_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."drawing_discipline"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_discipline" ADD CONSTRAINT "project_discipline_lead_user_id_user_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_contact_project_idx" ON "project_contact" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_discipline_uq" ON "project_discipline" USING btree ("project_id","discipline_id");--> statement-breakpoint
CREATE INDEX "project_milestone_project_due_idx" ON "project_milestone" USING btree ("project_id","due_date");