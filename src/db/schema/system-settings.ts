import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const SYSTEM_SETTINGS_ID = "system";

export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey().default(SYSTEM_SETTINGS_ID),
  procurementTo: jsonb("procurement_to").notNull().$type<string[]>().default([]),
  procurementCc: jsonb("procurement_cc").notNull().$type<string[]>().default([]),
  procurementSubject: text("procurement_subject"),
  procurementBody: text("procurement_body"),
  /** Parsed with `parseReminderConfig` — missing keys fall back to defaults. */
  drawingReminders: jsonb("drawing_reminders").notNull().$type<Record<string, unknown>>().default({}),
  /** From which status a revision's PDF can be uploaded — parsed with `parseDrawingFileGate`. */
  drawingFileGate: text("drawing_file_gate").notNull().default("approved"),
  updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
