CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'user.created';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'user.disabled';--> statement-breakpoint
ALTER TABLE "organization" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "organization" CASCADE;--> statement-breakpoint
DROP TABLE "membership" CASCADE;--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "category" DROP CONSTRAINT "category_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "vendor" DROP CONSTRAINT "vendor_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "item" DROP CONSTRAINT "item_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_organization_id_organization_id_fk";
--> statement-breakpoint
DROP INDEX "audit_org_created_idx";--> statement-breakpoint
DROP INDEX "vendor_org_code_idx";--> statement-breakpoint
DROP INDEX "item_org_sku_uq";--> statement-breakpoint
DROP INDEX "project_org_code_idx";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "vendor_code_idx" ON "vendor" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "item_sku_uq" ON "item" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "project_code_idx" ON "project" USING btree ("code");--> statement-breakpoint
ALTER TABLE "audit_log" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "category" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "vendor" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "organization_id";