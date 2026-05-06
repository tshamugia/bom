ALTER TYPE "public"."audit_kind" ADD VALUE 'project.deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'project.restored';--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "project_deleted_at_idx" ON "project" USING btree ("deleted_at");