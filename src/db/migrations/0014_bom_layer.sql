-- Add new audit kinds for the BOM-as-entity layer.
ALTER TYPE "public"."audit_kind" ADD VALUE IF NOT EXISTS 'bom.renamed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE IF NOT EXISTS 'bom.deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE IF NOT EXISTS 'bom.duplicated';--> statement-breakpoint

-- Create the new bom table.
CREATE TABLE "bom" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "name" text NOT NULL,
  "owner_id" text,
  "deleted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "bom" ADD CONSTRAINT "bom_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom" ADD CONSTRAINT "bom_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bom_project_idx" ON "bom" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bom_project_name_uq" ON "bom" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "bom_deleted_at_idx" ON "bom" USING btree ("deleted_at");--> statement-breakpoint

-- Backfill: one BOM per existing project, named after the project.
INSERT INTO "bom" ("id", "project_id", "name", "owner_id", "created_at", "updated_at")
SELECT
  replace(gen_random_uuid()::text, '-', ''),
  p.id, p.name, p.owner_id, p.created_at, p.updated_at
FROM "project" p
WHERE p.deleted_at IS NULL
  OR EXISTS (SELECT 1 FROM "bom_revision" r WHERE r.project_id = p.id);--> statement-breakpoint

-- Add bom_revision.bom_id, backfill from project, enforce NOT NULL + FK.
ALTER TABLE "bom_revision" ADD COLUMN "bom_id" text;--> statement-breakpoint
UPDATE "bom_revision" r SET "bom_id" = b.id
FROM "bom" b
WHERE b.project_id = r.project_id;--> statement-breakpoint
ALTER TABLE "bom_revision" ALTER COLUMN "bom_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD CONSTRAINT "bom_revision_bom_id_bom_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Swap unique index from (project_id, letter) to (bom_id, letter).
DROP INDEX IF EXISTS "bom_rev_project_letter_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "bom_rev_bom_letter_uq" ON "bom_revision" USING btree ("bom_id","letter");--> statement-breakpoint

-- Drop bom_revision.project_id (and its FK).
ALTER TABLE "bom_revision" DROP CONSTRAINT IF EXISTS "bom_revision_project_id_project_id_fk";--> statement-breakpoint
ALTER TABLE "bom_revision" DROP COLUMN "project_id";--> statement-breakpoint

-- Drop project.status and the project_status enum (no longer used).
ALTER TABLE "project" DROP COLUMN IF EXISTS "status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."project_status";
