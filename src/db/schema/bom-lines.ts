import { pgTable, text, integer, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { bomRevisions } from "./bom-revisions";
import { items } from "./items";

export const bomLines = pgTable(
  "bom_line",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    revisionId: text("revision_id").notNull().references(() => bomRevisions.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull().default(0),
    unitPriceSnapshot: numeric("unit_price_snapshot", { precision: 12, scale: 4 }).notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({ revItemUq: uniqueIndex("bom_line_rev_item_uq").on(t.revisionId, t.itemId) }),
);
