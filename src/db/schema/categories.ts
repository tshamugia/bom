import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { organizations } from "./organizations";

export const categories = pgTable("category", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const subcategories = pgTable("subcategory", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  categoryId: text("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});
