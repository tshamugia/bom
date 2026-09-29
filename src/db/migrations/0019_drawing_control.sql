CREATE TYPE "public"."drawing_remark_source" AS ENUM('client', 'site', 'internal');--> statement-breakpoint
CREATE TYPE "public"."drawing_transmittal_purpose" AS ENUM('approval', 'construction', 'information', 'comment');--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.time.logged';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.time.deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.remark.added';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.remark.resolved';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.remark.reopened';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.transmittal.sent';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.transmittal.acknowledged';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.reminders.sent';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.reminders.failed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.report.exported';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.drawing.linked';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.drawing.unlinked';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.drawing.updated';--> statement-breakpoint
CREATE TABLE "bom_revision_drawing" (
	"id" text PRIMARY KEY NOT NULL,
	"bom_revision_id" text NOT NULL,
	"drawing_id" text NOT NULL,
	"drawing_revision_id" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_remark" (
	"id" text PRIMARY KEY NOT NULL,
	"drawing_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"source" "drawing_remark_source" NOT NULL,
	"body" text NOT NULL,
	"raised_by_id" text,
	"resolved_at" timestamp,
	"resolved_by_id" text,
	"resolved_in_revision_id" text,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_reminder_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_reminder_run" (
	"day" date PRIMARY KEY NOT NULL,
	"recipients" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "drawing_time_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"drawing_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"user_id" text,
	"hours" numeric(6, 2) NOT NULL,
	"work_date" date NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_transmittal" (
	"id" text PRIMARY KEY NOT NULL,
	"drawing_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"purpose" "drawing_transmittal_purpose" NOT NULL,
	"recipient_user_id" text,
	"external_name" text,
	"note" text,
	"sent_by_id" text,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drawing" ADD COLUMN "estimated_hours" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "drawing_reminders" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_revision_drawing" ADD CONSTRAINT "bom_revision_drawing_bom_revision_id_bom_revision_id_fk" FOREIGN KEY ("bom_revision_id") REFERENCES "public"."bom_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_revision_drawing" ADD CONSTRAINT "bom_revision_drawing_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_revision_drawing" ADD CONSTRAINT "bom_revision_drawing_drawing_revision_id_drawing_revision_id_fk" FOREIGN KEY ("drawing_revision_id") REFERENCES "public"."drawing_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_revision_drawing" ADD CONSTRAINT "bom_revision_drawing_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_remark" ADD CONSTRAINT "drawing_remark_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_remark" ADD CONSTRAINT "drawing_remark_revision_id_drawing_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."drawing_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_remark" ADD CONSTRAINT "drawing_remark_raised_by_id_user_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_remark" ADD CONSTRAINT "drawing_remark_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_remark" ADD CONSTRAINT "drawing_remark_resolved_in_revision_id_drawing_revision_id_fk" FOREIGN KEY ("resolved_in_revision_id") REFERENCES "public"."drawing_revision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_reminder_recipient" ADD CONSTRAINT "drawing_reminder_recipient_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_reminder_recipient" ADD CONSTRAINT "drawing_reminder_recipient_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_time_entry" ADD CONSTRAINT "drawing_time_entry_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_time_entry" ADD CONSTRAINT "drawing_time_entry_revision_id_drawing_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."drawing_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_time_entry" ADD CONSTRAINT "drawing_time_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_transmittal" ADD CONSTRAINT "drawing_transmittal_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_transmittal" ADD CONSTRAINT "drawing_transmittal_revision_id_drawing_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."drawing_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_transmittal" ADD CONSTRAINT "drawing_transmittal_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_transmittal" ADD CONSTRAINT "drawing_transmittal_sent_by_id_user_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bom_rev_drawing_uq" ON "bom_revision_drawing" USING btree ("bom_revision_id","drawing_id");--> statement-breakpoint
CREATE INDEX "bom_rev_drawing_drawing_idx" ON "bom_revision_drawing" USING btree ("drawing_id");--> statement-breakpoint
CREATE INDEX "drawing_remark_drawing_idx" ON "drawing_remark" USING btree ("drawing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_reminder_global_uq" ON "drawing_reminder_recipient" USING btree ("user_id") WHERE "project_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_reminder_project_uq" ON "drawing_reminder_recipient" USING btree ("project_id","user_id") WHERE "project_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "drawing_time_drawing_idx" ON "drawing_time_entry" USING btree ("drawing_id");--> statement-breakpoint
CREATE INDEX "drawing_time_user_idx" ON "drawing_time_entry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drawing_transmittal_drawing_idx" ON "drawing_transmittal" USING btree ("drawing_id");--> statement-breakpoint
CREATE INDEX "drawing_transmittal_recipient_idx" ON "drawing_transmittal" USING btree ("recipient_user_id");