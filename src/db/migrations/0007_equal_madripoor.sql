CREATE TABLE "bom_section" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bom_line" ADD COLUMN "section_id" text;--> statement-breakpoint
ALTER TABLE "bom_section" ADD CONSTRAINT "bom_section_revision_id_bom_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."bom_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bom_section_revision_idx" ON "bom_section" USING btree ("revision_id","position");--> statement-breakpoint
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_section_id_bom_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."bom_section"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bom_line_section_idx" ON "bom_line" USING btree ("section_id");