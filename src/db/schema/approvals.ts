import { pgTable, text, integer, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { bomRevisions } from "./bom-revisions";
import { user } from "./auth";

export const workflowStatusEnum = pgEnum("workflow_status", ["pending", "approved", "rejected", "cancelled"]);
export const stepStatusEnum = pgEnum("step_status", ["pending", "active", "approved", "rejected", "skipped"]);

export const approvalWorkflows = pgTable("approval_workflow", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  revisionId: text("revision_id").notNull().references(() => bomRevisions.id, { onDelete: "cascade" }),
  status: workflowStatusEnum("status").notNull().default("pending"),
  currentStepIndex: integer("current_step_index").notNull().default(0),
  requestedById: text("requested_by_id").references(() => user.id, { onDelete: "set null" }),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
}, t => ({
  revIdx: index("workflow_revision_idx").on(t.revisionId),
}));

export const approvalSteps = pgTable("approval_step", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  workflowId: text("workflow_id").notNull().references(() => approvalWorkflows.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  role: text("role").notNull(),
  assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
  status: stepStatusEnum("status").notNull().default("pending"),
  decisionNote: text("decision_note"),
  decidedById: text("decided_by_id").references(() => user.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at"),
}, t => ({
  workflowPosUq: uniqueIndex("step_workflow_position_uq").on(t.workflowId, t.position),
}));
