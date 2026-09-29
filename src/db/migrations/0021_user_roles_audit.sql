ALTER TYPE "public"."audit_kind" ADD VALUE 'auth.signin';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'auth.signin.failed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'user.password.changed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'user.password.reset';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'user.password.reset.requested';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'user.role.changed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'vendor.updated';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'vendor.deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'item.updated';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'item.deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'approval.cancelled';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'settings.procurement.updated';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'member'::text;--> statement-breakpoint
UPDATE "user" SET "role" = 'admin' WHERE "role" = 'owner';--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'member'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "user_agent" text;--> statement-breakpoint
CREATE INDEX "audit_kind_idx" ON "audit_log" USING btree ("kind","created_at");