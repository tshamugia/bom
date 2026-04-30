import { pgTable, text, timestamp, integer, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { organizations } from "./organizations";
import { vendors } from "./vendors";
import { categories, subcategories } from "./categories";
import { stockStateEnum } from "./enums";

export const items = pgTable(
  "item",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    description: text("description").notNull(),
    manufacturer: text("manufacturer").notNull(),
    unit: text("unit").notNull().default("pcs"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 4 }).notNull(),
    onHand: integer("on_hand").notNull().default(0),
    stockState: stockStateEnum("stock_state").notNull().default("in-stock"),
    vendorId: text("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    subcategoryId: text("subcategory_id").references(() => subcategories.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    orgSkuUnique: uniqueIndex("item_org_sku_uq").on(t.organizationId, t.sku),
    vendorIdx: index("item_vendor_idx").on(t.vendorId),
    catIdx: index("item_cat_idx").on(t.categoryId, t.subcategoryId),
  }),
);
