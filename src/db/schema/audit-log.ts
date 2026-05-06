import { pgTable, text, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { user } from "./auth";

export const auditKindEnum = pgEnum("audit_kind", [
  "bom.created",
  "bom.line.added",
  "bom.line.moved",
  "bom.export.generated",
  "bom.section.created",
  "bom.section.renamed",
  "bom.section.reordered",
  "bom.section.deleted",
  "approval.requested",
  "approval.approved",
  "approval.rejected",
  "vendor.created",
  "item.created",
  "catalog.imported",
  "catalog.exported",
  "vendors.exported",
  "bom.revision.committed",
  "bom.revision.branched",
  "bom.revision.discarded",
  "user.created",
  "user.disabled",
  "project.deleted",
  "project.restored",
]);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    kind: auditKindEnum("kind").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    summary: text("summary").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    createdIdx: index("audit_created_idx").on(t.createdAt),
  }),
);
