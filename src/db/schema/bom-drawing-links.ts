import { pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { bomRevisions } from "./bom-revisions";
import { drawings, drawingRevisions } from "./drawings";
import { user } from "./auth";

/**
 * The drawing revision a BOM revision was built from. Copied forward when a
 * BOM revision is branched, so a newer drawing revision that changes the BOM
 * shows up as outdated — unless someone confirmed this BOM revision doesn't
 * need to change for it (`checkedRevisionId`).
 */
export const bomRevisionDrawings = pgTable(
  "bom_revision_drawing",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    bomRevisionId: text("bom_revision_id").notNull().references(() => bomRevisions.id, { onDelete: "cascade" }),
    drawingId: text("drawing_id").notNull().references(() => drawings.id, { onDelete: "cascade" }),
    drawingRevisionId: text("drawing_revision_id").notNull().references(() => drawingRevisions.id, { onDelete: "cascade" }),
    /** Newer drawing revision checked against this BOM revision with no BOM change; the built-from revision stays as is. */
    checkedRevisionId: text("checked_revision_id").references(() => drawingRevisions.id, { onDelete: "set null" }),
    checkedById: text("checked_by_id").references(() => user.id, { onDelete: "set null" }),
    checkedAt: timestamp("checked_at"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    revisionDrawingUq: uniqueIndex("bom_rev_drawing_uq").on(t.bomRevisionId, t.drawingId),
    drawingIdx: index("bom_rev_drawing_drawing_idx").on(t.drawingId),
  }),
);
