import { pgTable, text, timestamp, uniqueIndex, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { projects } from "./projects";
import { user } from "./auth";
import { revisionStatusEnum } from "./enums";

export const bomRevisions = pgTable(
  "bom_revision",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    parentRevisionId: text("parent_revision_id").references((): AnyPgColumn => bomRevisions.id, { onDelete: "set null" }),
    letter: text("letter").notNull(),
    status: revisionStatusEnum("status").notNull().default("draft"),
    notes: text("notes"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    committedById: text("committed_by_id").references(() => user.id, { onDelete: "set null" }),
    committedAt: timestamp("committed_at"),
    commitMessage: text("commit_message"),
    lockedAt: timestamp("locked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    projectLetterUq: uniqueIndex("bom_rev_project_letter_uq").on(t.projectId, t.letter),
    parentIdx: index("bom_rev_parent_idx").on(t.parentRevisionId),
  }),
);
