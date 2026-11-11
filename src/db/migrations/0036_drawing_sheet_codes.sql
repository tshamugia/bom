ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.check.confirmed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.check.wrong-file';--> statement-breakpoint
ALTER TYPE "public"."drawing_check_status" ADD VALUE 'held';--> statement-breakpoint
ALTER TYPE "public"."drawing_check_status" ADD VALUE 'wrong-file';--> statement-breakpoint
ALTER TABLE "drawing_check_run" ADD COLUMN "sheet_check" text;--> statement-breakpoint
ALTER TABLE "drawing_check_run" ADD COLUMN "linked_sheet_code" text;--> statement-breakpoint
ALTER TABLE "drawing_check_run" ADD COLUMN "applied_at" timestamp;--> statement-breakpoint
ALTER TABLE "drawing_check_run" ADD COLUMN "decided_by_id" text;--> statement-breakpoint
ALTER TABLE "drawing_check_run" ADD COLUMN "decided_at" timestamp;--> statement-breakpoint
ALTER TABLE "drawing" ADD COLUMN "sheet_code" text;--> statement-breakpoint
ALTER TABLE "drawing_check_run" ADD CONSTRAINT "drawing_check_run_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_project_sheet_code_uq" ON "drawing" USING btree ("project_id","sheet_code") WHERE "deleted_at" IS NULL AND "sheet_code" IS NOT NULL;--> statement-breakpoint
-- Runs checked before this migration changed their Remarks when they finished; "Wrong file" undoes only the latest.
UPDATE "drawing_check_run" SET "applied_at" = "finished_at" WHERE "status" = 'done' AND "remark_changes" IS NOT NULL AND ("remark_changes"->>'skipped') IS NULL;
