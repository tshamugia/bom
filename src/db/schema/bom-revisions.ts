import { pgTable, text, timestamp, uniqueIndex, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { boms } from "./boms";
import { user } from "./auth";
import { revisionStatusEnum } from "./enums";

export const bomRevisions = pgTable(
  "bom_revision",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    bomId: text("bom_id").notNull().references(() => boms.id, { onDelete: "cascade" }),
    parentRevisionId: text("parent_revision_id").references((): AnyPgColumn => bomRevisions.id, { onDelete: "set null" }),
    letter: text("letter").notNull(),
    status: revisionStatusEnum("status").notNull().default("draft"),
    notes: text("notes"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    committedById: text("committed_by_id").references(() => user.id, { onDelete: "set null" }),
    committedAt: timestamp("committed_at"),
    commitMessage: text("commit_message"),
    lockedAt: timestamp("locked_at"),
    /** Last status set by hand (the client's approval or taking it back): who, when and the comment they gave. */
    statusChangedById: text("status_changed_by_id").references(() => user.id, { onDelete: "set null" }),
    statusChangedAt: timestamp("status_changed_at"),
    statusComment: text("status_comment"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    bomLetterUq: uniqueIndex("bom_rev_bom_letter_uq").on(t.bomId, t.letter),
    parentIdx: index("bom_rev_parent_idx").on(t.parentRevisionId),
  }),
);
