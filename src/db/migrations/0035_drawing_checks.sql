CREATE TYPE "public"."drawing_check_status" AS ENUM('pending', 'queued', 'done', 'failed');--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.check.requested';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.check.finished';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.check.settings.changed';--> statement-breakpoint
ALTER TYPE "public"."drawing_event_kind" ADD VALUE 'check';--> statement-breakpoint
ALTER TYPE "public"."drawing_remark_source" ADD VALUE 'check';--> statement-breakpoint
CREATE TABLE "drawing_check_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_check_run" (
	"id" text PRIMARY KEY NOT NULL,
	"drawing_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"revision_label" text NOT NULL,
	"uploaded_by_id" text,
	"original_name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text,
	"object_key" text NOT NULL,
	"status" "drawing_check_status" DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"error" text,
	"config_version" integer DEFAULT 0 NOT NULL,
	"config_snapshot" jsonb,
	"findings" jsonb,
	"counts" jsonb,
	"details" jsonb,
	"remark_changes" jsonb,
	"engine_version" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drawing_remark" ADD COLUMN "check_rule_id" text;--> statement-breakpoint
ALTER TABLE "drawing_remark" ADD COLUMN "check_severity" text;--> statement-breakpoint
ALTER TABLE "drawing_remark" ADD COLUMN "last_check_run_id" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "drawing_check_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drawing_check_config" ADD CONSTRAINT "drawing_check_config_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_check_run" ADD CONSTRAINT "drawing_check_run_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_check_run" ADD CONSTRAINT "drawing_check_run_revision_id_drawing_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."drawing_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_check_run" ADD CONSTRAINT "drawing_check_run_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drawing_check_run_drawing_created_idx" ON "drawing_check_run" USING btree ("drawing_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_check_run_object_key_uq" ON "drawing_check_run" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_check_run_revision_active_uq" ON "drawing_check_run" USING btree ("revision_id") WHERE "status" IN ('pending', 'queued');--> statement-breakpoint
ALTER TABLE "drawing_remark" ADD CONSTRAINT "drawing_remark_last_check_run_id_drawing_check_run_id_fk" FOREIGN KEY ("last_check_run_id") REFERENCES "public"."drawing_check_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_remark_open_check_rule_uq" ON "drawing_remark" USING btree ("drawing_id","check_rule_id") WHERE "resolved_at" IS NULL AND "check_rule_id" IS NOT NULL;