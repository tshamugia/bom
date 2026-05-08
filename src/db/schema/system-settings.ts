import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const SYSTEM_SETTINGS_ID = "system";

export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey().default(SYSTEM_SETTINGS_ID),
  procurementTo: jsonb("procurement_to").notNull().$type<string[]>().default([]),
  procurementCc: jsonb("procurement_cc").notNull().$type<string[]>().default([]),
  procurementSubject: text("procurement_subject"),
  procurementBody: text("procurement_body"),
  updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
