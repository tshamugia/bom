CREATE TYPE "public"."drawing_file_status" AS ENUM('pending', 'ready');--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.file.uploaded';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.file.removed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.file.downloaded';--> statement-breakpoint
ALTER TYPE "public"."drawing_event_kind" ADD VALUE 'file';--> statement-breakpoint
CREATE TABLE "drawing_file" (
	"id" text PRIMARY KEY NOT NULL,
	"drawing_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "drawing_file_status" DEFAULT 'pending' NOT NULL,
	"uploaded_by_id" text,
	"uploaded_at" timestamp,
	"archived_at" timestamp,
	"archived_by_id" text,
	"archive_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "drawing_file_gate" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "drawing_file" ADD CONSTRAINT "drawing_file_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_file" ADD CONSTRAINT "drawing_file_revision_id_drawing_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."drawing_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_file" ADD CONSTRAINT "drawing_file_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_file" ADD CONSTRAINT "drawing_file_archived_by_id_user_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_file_object_key_uq" ON "drawing_file" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "drawing_file_drawing_idx" ON "drawing_file" USING btree ("drawing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_file_revision_current_uq" ON "drawing_file" USING btree ("revision_id") WHERE "status" = 'ready' AND "archived_at" IS NULL;