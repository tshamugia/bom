import { pgTable, text, timestamp, integer, date, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { user } from "./auth";

export const projects = pgTable(
  "project",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    code: text("code").notNull(),
    name: text("name").notNull(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    targetDate: date("target_date"),
    quantity: integer("quantity").notNull().default(1),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    codeIdx: index("project_code_idx").on(t.code),
    deletedAtIdx: index("project_deleted_at_idx").on(t.deletedAt),
  }),
);
