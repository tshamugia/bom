CREATE TYPE "public"."export_format" AS ENUM('xlsx', 'csv', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('exported', 'archived', 'failed');--> statement-breakpoint
CREATE TABLE "bom_export" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"format" "export_format" DEFAULT 'xlsx' NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"byte_size" integer NOT NULL,
	"options" jsonb NOT NULL,
	"status" "export_status" DEFAULT 'exported' NOT NULL,
	"generated_by_id" text,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bom_export" ADD CONSTRAINT "bom_export_revision_id_bom_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."bom_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_export" ADD CONSTRAINT "bom_export_generated_by_id_user_id_fk" FOREIGN KEY ("generated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;