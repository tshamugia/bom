ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.revision.committed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.revision.branched';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'bom.revision.discarded';--> statement-breakpoint
ALTER TYPE "public"."revision_status" ADD VALUE 'committed' BEFORE 'in-progress';--> statement-breakpoint
ALTER TABLE "bom_export" ADD COLUMN "revision_status_at_export" text DEFAULT 'locked' NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_line" ADD COLUMN "sku_snapshot" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_line" ADD COLUMN "description_snapshot" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_line" ADD COLUMN "manufacturer_snapshot" text;--> statement-breakpoint
ALTER TABLE "bom_line" ADD COLUMN "unit_snapshot" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_line" ADD COLUMN "vendor_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD COLUMN "parent_revision_id" text;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD COLUMN "committed_by_id" text;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD COLUMN "committed_at" timestamp;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD COLUMN "commit_message" text;--> statement-breakpoint
ALTER TABLE "bom_section" ADD COLUMN "section_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD CONSTRAINT "bom_revision_parent_revision_id_bom_revision_id_fk" FOREIGN KEY ("parent_revision_id") REFERENCES "public"."bom_revision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD CONSTRAINT "bom_revision_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_revision" ADD CONSTRAINT "bom_revision_committed_by_id_user_id_fk" FOREIGN KEY ("committed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bom_rev_parent_idx" ON "bom_revision" USING btree ("parent_revision_id");--> statement-breakpoint
CREATE INDEX "bom_section_key_idx" ON "bom_section" USING btree ("section_key");
--> statement-breakpoint
-- Backfill bom_section.section_key with the row id (stable identity for legacy rows)
UPDATE "bom_section" SET "section_key" = "id" WHERE "section_key" = '' OR "section_key" IS NULL;
--> statement-breakpoint
-- Backfill bom_revision.owner_id from project.owner_id
UPDATE "bom_revision" SET "owner_id" = p."owner_id"
FROM "project" p WHERE p."id" = "bom_revision"."project_id" AND "bom_revision"."owner_id" IS NULL;
--> statement-breakpoint
-- Backfill bom_line snapshots from current item + vendor data
UPDATE "bom_line" SET
  "sku_snapshot"          = i."sku",
  "description_snapshot"  = i."description",
  "manufacturer_snapshot" = i."manufacturer",
  "unit_snapshot"         = i."unit",
  "vendor_name_snapshot"  = v."name"
FROM "item" i LEFT JOIN "vendor" v ON v."id" = i."vendor_id"
WHERE i."id" = "bom_line"."item_id"
  AND ("bom_line"."sku_snapshot" = '' OR "bom_line"."sku_snapshot" IS NULL);
