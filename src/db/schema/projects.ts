import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";
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
    // Standard codes (26TGT, NAMING §4.2) are unique across all projects, archived ones
    // included. Old-style codes (BS-005) are left out so they can't block the migration.
    codeStdUq: uniqueIndex("project_code_std_uq").on(t.code).where(sql`${t.code} ~ '^[0-9]{2}[A-Z]{3}$'`),
    deletedAtIdx: index("project_deleted_at_idx").on(t.deletedAt),
  }),
);
