ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.line.qty.updated' BEFORE 'bom.export.generated';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.line.removed' BEFORE 'bom.export.generated';--> statement-breakpoint
ALTER TABLE "bom" ADD COLUMN "last_modified_by_id" text;--> statement-breakpoint
ALTER TABLE "bom" ADD CONSTRAINT "bom_last_modified_by_id_user_id_fk" FOREIGN KEY ("last_modified_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;