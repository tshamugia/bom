import { pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { user } from "./auth";
import { drawingRemarks, drawings } from "./drawings";

/**
 * A rule marked as a false error ("მცდარი შეცდომა") on one drawing (issue #18,
 * stage 3): checks of the drawing no longer run it, and its Remarks are left
 * alone. Whoever closes the automatic Remark marks it; only an admin removes it.
 */
export const drawingCheckWaivers = pgTable(
  "drawing_check_waiver",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    drawingId: text("drawing_id").notNull().references(() => drawings.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    /** Why the check is wrong here — the closing note of the Remark. */
    reason: text("reason").notNull(),
    /** The automatic Remark that was closed as a false error. */
    remarkId: text("remark_id").references(() => drawingRemarks.id, { onDelete: "set null" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    drawingRuleUq: uniqueIndex("drawing_check_waiver_drawing_rule_uq").on(t.drawingId, t.ruleId),
    remarkIdx: index("drawing_check_waiver_remark_idx").on(t.remarkId),
  }),
);
