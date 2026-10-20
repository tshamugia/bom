CREATE TABLE "my_work_seen" (
	"user_id" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "my_work_seen" ADD CONSTRAINT "my_work_seen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;