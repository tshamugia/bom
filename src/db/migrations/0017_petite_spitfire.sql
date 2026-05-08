ALTER TYPE "public"."audit_kind" ADD VALUE 'procurement.email.sent';--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" text PRIMARY KEY DEFAULT 'system' NOT NULL,
	"procurement_to" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"procurement_cc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"procurement_subject" text,
	"procurement_body" text,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;