ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.check.waived';--> statement-breakpoint
ALTER TYPE "public"."audit_kind" ADD VALUE 'drawing.check.waiver.removed';--> statement-breakpoint
CREATE TABLE "drawing_check_waiver" (
	"id" text PRIMARY KEY NOT NULL,
	"drawing_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"reason" text NOT NULL,
	"remark_id" text,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "check_client_naming" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drawing_check_waiver" ADD CONSTRAINT "drawing_check_waiver_drawing_id_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_check_waiver" ADD CONSTRAINT "drawing_check_waiver_remark_id_drawing_remark_id_fk" FOREIGN KEY ("remark_id") REFERENCES "public"."drawing_remark"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_check_waiver" ADD CONSTRAINT "drawing_check_waiver_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drawing_check_waiver_drawing_rule_uq" ON "drawing_check_waiver" USING btree ("drawing_id","rule_id");--> statement-breakpoint
CREATE INDEX "drawing_check_waiver_remark_idx" ON "drawing_check_waiver" USING btree ("remark_id");