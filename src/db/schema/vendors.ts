import { pgTable, text, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { vendorStatusEnum } from "./enums";

export const vendors = pgTable(
  "vendor",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    name: text("name").notNull(),
    code: text("code").notNull(),
    country: text("country").notNull(),
    leadTime: text("lead_time").notNull(),
    rating: real("rating").notNull().default(0),
    status: vendorStatusEnum("status").notNull().default("approved"),
    itemsCount: integer("items_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    codeIdx: index("vendor_code_idx").on(t.code),
  }),
);
