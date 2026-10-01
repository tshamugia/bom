ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.revision.bom_impact';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.drawing.checked';--> statement-breakpoint
ALTER TABLE "bom_revision_drawing" ADD COLUMN "checked_revision_id" text;--> statement-breakpoint
ALTER TABLE "bom_revision_drawing" ADD COLUMN "checked_by_id" text;--> statement-breakpoint
ALTER TABLE "bom_revision_drawing" ADD COLUMN "checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "drawing_revision" ADD COLUMN "bom_impact" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_revision_drawing" ADD CONSTRAINT "bom_revision_drawing_checked_revision_id_drawing_revision_id_fk" FOREIGN KEY ("checked_revision_id") REFERENCES "public"."drawing_revision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_revision_drawing" ADD CONSTRAINT "bom_revision_drawing_checked_by_id_user_id_fk" FOREIGN KEY ("checked_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;