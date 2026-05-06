import { pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { vendors } from "./vendors";
import { categories, subcategories } from "./categories";

export const items = pgTable(
  "item",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sku: text("sku").notNull(),
    description: text("description").notNull(),
    manufacturer: text("manufacturer").notNull(),
    unit: text("unit").notNull().default("pcs"),
    vendorId: text("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    subcategoryId: text("subcategory_id").references(() => subcategories.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    skuUnique: uniqueIndex("item_sku_uq").on(t.sku),
    vendorIdx: index("item_vendor_idx").on(t.vendorId),
    catIdx: index("item_cat_idx").on(t.categoryId, t.subcategoryId),
  }),
);
