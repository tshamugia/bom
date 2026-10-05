ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.status.changed';--> statement-breakpoint
ALTER TABLE "bom_revision" ADD COLUMN "status_changed_by_id" text;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD COLUMN "status_changed_at" timestamp;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD COLUMN "status_comment" text;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD CONSTRAINT "bom_revision_status_changed_by_id_user_id_fk" FOREIGN KEY ("status_changed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;