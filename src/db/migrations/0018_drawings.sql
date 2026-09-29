CREATE TYPE "public"."drawing_event_kind" AS ENUM('created', 'updated', 'status', 'comment');--> statement-breakpoint
CREATE TYPE "public"."drawing_status" AS ENUM('in-progress', 'paused', 'need-approval', 'awaiting-approval', 'approved-a', 'approved-b', 'as-built');--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.created';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.updated';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.revision.created';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.status.changed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.comment.added';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.notification.sent';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.notification.failed';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.settings.updated';--> statement-breakpoint
CREATE TABLE "drawing_discipline" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_event" (
	"id" text PRIMARY KEY NOT NULL,
	"drawing_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"kind" "drawing_event_kind" NOT NULL,
	"from_status" "drawing_status",
	"to_status" "drawing_status",
	"body" text,
	"actor_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_notify_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"drawing_id" text NOT NULL,
	"number" integer NOT NULL,
	"status" "drawing_status" DEFAULT 'in-progress' NOT NULL,
	"commit_message" text NOT NULL,
	"reviewer_id" text,
	"reviewed_by_id" text,
	"reviewed_at" timestamp,
	"created_by_id" text,
	"locked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"discipline_id" text,
	"owner_id" text,
	"due_date" date,
	"created_by_id" text,
	"last_modified_by_id" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drawing_event" ADD CONSTRAINT "drawing_event_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_event" ADD CONSTRAINT "drawing_event_revision_id_drawing_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."drawing_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_event" ADD CONSTRAINT "drawing_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_notify_recipient" ADD CONSTRAINT "drawing_notify_recipient_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_notify_recipient" ADD CONSTRAINT "drawing_notify_recipient_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_revision" ADD CONSTRAINT "drawing_revision_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_revision" ADD CONSTRAINT "drawing_revision_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_revision" ADD CONSTRAINT "drawing_revision_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_revision" ADD CONSTRAINT "drawing_revision_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_discipline_id_drawing_discipline_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."drawing_discipline"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_last_modified_by_id_user_id_fk" FOREIGN KEY ("last_modified_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_discipline_name_uq" ON "drawing_discipline" USING btree ("name");--> statement-breakpoint
CREATE INDEX "drawing_event_drawing_created_idx" ON "drawing_event" USING btree ("drawing_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_notify_global_uq" ON "drawing_notify_recipient" USING btree ("user_id") WHERE "project_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_notify_project_uq" ON "drawing_notify_recipient" USING btree ("project_id","user_id") WHERE "project_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_rev_drawing_number_uq" ON "drawing_revision" USING btree ("drawing_id","number");--> statement-breakpoint
CREATE INDEX "drawing_rev_reviewer_idx" ON "drawing_revision" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "drawing_project_idx" ON "drawing" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_project_code_uq" ON "drawing" USING btree ("project_id","code") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "drawing_deleted_at_idx" ON "drawing" USING btree ("deleted_at");--> statement-breakpoint
INSERT INTO "drawing_discipline" ("id", "name", "position") VALUES
	(gen_random_uuid()::text, 'ELV', 0),
	(gen_random_uuid()::text, 'Fire Alarm', 1),
	(gen_random_uuid()::text, 'CCTV', 2),
	(gen_random_uuid()::text, 'BMS', 3),
	(gen_random_uuid()::text, 'Access Control', 4),
	(gen_random_uuid()::text, 'Electrical', 5)
ON CONFLICT DO NOTHING;