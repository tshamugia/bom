ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.time.shared.logged';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.time.shared.deleted';--> statement-breakpoint
CREATE TABLE "drawing_shared_time_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text,
	"hours" numeric(6, 2) NOT NULL,
	"work_date" date NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawing_shared_time_member" (
	"shared_entry_id" text NOT NULL,
	"drawing_id" text NOT NULL,
	"revision_id" text NOT NULL,
	CONSTRAINT "drawing_shared_time_member_shared_entry_id_drawing_id_pk" PRIMARY KEY("shared_entry_id","drawing_id")
);
--> statement-breakpoint
ALTER TABLE "drawing_remark" ADD COLUMN "shared_group_id" text;--> statement-breakpoint
ALTER TABLE "drawing_shared_time_entry" ADD CONSTRAINT "drawing_shared_time_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_shared_time_entry" ADD CONSTRAINT "drawing_shared_time_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_shared_time_member" ADD CONSTRAINT "drawing_shared_time_member_shared_entry_id_drawing_shared_time_entry_id_fk" FOREIGN KEY ("shared_entry_id") REFERENCES "public"."drawing_shared_time_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_shared_time_member" ADD CONSTRAINT "drawing_shared_time_member_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_shared_time_member" ADD CONSTRAINT "drawing_shared_time_member_revision_id_drawing_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."drawing_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drawing_shared_time_project_idx" ON "drawing_shared_time_entry" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "drawing_shared_time_user_idx" ON "drawing_shared_time_entry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drawing_shared_time_member_drawing_idx" ON "drawing_shared_time_member" USING btree ("drawing_id");--> statement-breakpoint
CREATE INDEX "drawing_remark_shared_group_idx" ON "drawing_remark" USING btree ("shared_group_id");