ALTER TABLE "bom_line" DROP COLUMN "unit_price_snapshot";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "unit_price";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "on_hand";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "stock_state";--> statement-breakpoint
DROP TYPE "public"."stock_state";