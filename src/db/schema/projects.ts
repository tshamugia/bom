import { pgTable, text, timestamp, integer, date, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { user } from "./auth";
import { projectStatusEnum } from "./enums";

export const projects = pgTable(
  "project",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    code: text("code").notNull(),
    name: text("name").notNull(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    status: projectStatusEnum("status").notNull().default("draft"),
    targetDate: date("target_date"),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    codeIdx: index("project_code_idx").on(t.code),
  }),
);
