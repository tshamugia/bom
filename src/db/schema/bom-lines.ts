import { pgTable, text, integer, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { bomRevisions } from "./bom-revisions";
import { bomSections } from "./bom-sections";
import { items } from "./items";

export const bomLines = pgTable(
  "bom_line",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    revisionId: text("revision_id").notNull().references(() => bomRevisions.id, { onDelete: "cascade" }),
    sectionId: text("section_id").references(() => bomSections.id, { onDelete: "set null" }),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull().default(0),
    unitPriceSnapshot: numeric("unit_price_snapshot", { precision: 12, scale: 4 }).notNull(),
    skuSnapshot: text("sku_snapshot").notNull().default(""),
    descriptionSnapshot: text("description_snapshot").notNull().default(""),
    manufacturerSnapshot: text("manufacturer_snapshot"),
    unitSnapshot: text("unit_snapshot").notNull().default(""),
    vendorNameSnapshot: text("vendor_name_snapshot"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    revItemUq: uniqueIndex("bom_line_rev_item_uq").on(t.revisionId, t.itemId),
    sectionIdx: index("bom_line_section_idx").on(t.sectionId),
  }),
);
