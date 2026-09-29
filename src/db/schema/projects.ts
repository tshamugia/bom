import { pgTable, text, timestamp, date, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { user } from "./auth";

export const projects = pgTable(
  "project",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    code: text("code").notNull(),
    name: text("name").notNull(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    // Passport: who the project is for, where, and under which contract.
    clientName: text("client_name"),
    contractNo: text("contract_no"),
    siteAddress: text("site_address"),
    description: text("description"),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    codeIdx: index("project_code_idx").on(t.code),
    deletedAtIdx: index("project_deleted_at_idx").on(t.deletedAt),
  }),
);
