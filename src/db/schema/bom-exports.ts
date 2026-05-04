import { pgTable, text, timestamp, integer, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { bomRevisions } from "./bom-revisions";
import { user } from "./auth";

export const exportFormatEnum = pgEnum("export_format", ["xlsx", "csv", "pdf"]);
export const exportStatusEnum = pgEnum("export_status", ["exported", "archived", "failed"]);

export type ExportColumnKey =
  | "sku"
  | "description"
  | "manufacturer"
  | "vendor"
  | "unit"
  | "qty"
  | "unitPrice"
  | "total"
  | "stock";

export type ExportOptions = {
  columns: Record<ExportColumnKey, boolean>;
  groupByVendor: boolean;
  includeCoverPage: boolean;
};

export const bomExports = pgTable("bom_export", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  revisionId: text("revision_id").notNull().references(() => bomRevisions.id, { onDelete: "cascade" }),
  format: exportFormatEnum("format").notNull().default("xlsx"),
  fileKey: text("file_key").notNull(),
  fileName: text("file_name").notNull(),
  byteSize: integer("byte_size").notNull(),
  options: jsonb("options").notNull().$type<ExportOptions>(),
  status: exportStatusEnum("status").notNull().default("exported"),
  revisionStatusAtExport: text("revision_status_at_export").notNull().default("locked"),
  generatedById: text("generated_by_id").references(() => user.id, { onDelete: "set null" }),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});
