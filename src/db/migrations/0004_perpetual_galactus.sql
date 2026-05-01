CREATE TYPE "public"."step_status" AS ENUM('pending', 'active', 'approved', 'rejected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "approval_step" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"position" integer NOT NULL,
	"role" text NOT NULL,
	"assignee_id" text,
	"status" "step_status" DEFAULT 'pending' NOT NULL,
	"decision_note" text,
	"decided_by_id" text,
	"decided_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "approval_workflow" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"status" "workflow_status" DEFAULT 'pending' NOT NULL,
	"current_step_index" integer DEFAULT 0 NOT NULL,
	"requested_by_id" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_workflow_id_approval_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."approval_workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_workflow" ADD CONSTRAINT "approval_workflow_revision_id_bom_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."bom_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_workflow" ADD CONSTRAINT "approval_workflow_requested_by_id_user_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "step_workflow_position_uq" ON "approval_step" USING btree ("workflow_id","position");--> statement-breakpoint
CREATE INDEX "workflow_revision_idx" ON "approval_workflow" USING btree ("revision_id");