import { pgTable, pgEnum, text, integer, numeric, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { projects } from "./projects";
import { user } from "./auth";
import { DRAWING_STATUSES } from "../../lib/drawing-status";
import { REMARK_SOURCES, TRANSMITTAL_PURPOSES } from "../../lib/drawing-meta";

export const drawingStatusEnum = pgEnum("drawing_status", DRAWING_STATUSES);
export const drawingRemarkSourceEnum = pgEnum("drawing_remark_source", REMARK_SOURCES);
export const drawingTransmittalPurposeEnum = pgEnum("drawing_transmittal_purpose", TRANSMITTAL_PURPOSES);

export const drawingEventKindEnum = pgEnum("drawing_event_kind", [
  "created",
  "updated",
  "status",
  "comment",
]);

export const drawingDisciplines = pgTable(
  "drawing_discipline",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    nameUq: uniqueIndex("drawing_discipline_name_uq").on(t.name),
  }),
);

export const drawings = pgTable(
  "drawing",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    disciplineId: text("discipline_id").references(() => drawingDisciplines.id, { onDelete: "set null" }),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    /** Planned effort; engineers log the actual hours in `drawing_time_entry`. */
    estimatedHours: numeric("estimated_hours", { precision: 8, scale: 2, mode: "number" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    lastModifiedById: text("last_modified_by_id").references(() => user.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    projectIdx: index("drawing_project_idx").on(t.projectId),
    // Archived drawings free their code so it can be reused.
    projectCodeUq: uniqueIndex("drawing_project_code_uq")
      .on(t.projectId, t.code)
      .where(sql`"deleted_at" IS NULL`),
    deletedAtIdx: index("drawing_deleted_at_idx").on(t.deletedAt),
  }),
);

export const drawingRevisions = pgTable(
  "drawing_revision",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    drawingId: text("drawing_id").notNull().references(() => drawings.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: drawingStatusEnum("status").notNull().default("in-progress"),
    commitMessage: text("commit_message").notNull(),
    reviewerId: text("reviewer_id").references(() => user.id, { onDelete: "set null" }),
    reviewedById: text("reviewed_by_id").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    lockedAt: timestamp("locked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    drawingNumberUq: uniqueIndex("drawing_rev_drawing_number_uq").on(t.drawingId, t.number),
    reviewerIdx: index("drawing_rev_reviewer_idx").on(t.reviewerId),
  }),
);

export const drawingEvents = pgTable(
  "drawing_event",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    drawingId: text("drawing_id").notNull().references(() => drawings.id, { onDelete: "cascade" }),
    revisionId: text("revision_id").notNull().references(() => drawingRevisions.id, { onDelete: "cascade" }),
    kind: drawingEventKindEnum("kind").notNull(),
    fromStatus: drawingStatusEnum("from_status"),
    toStatus: drawingStatusEnum("to_status"),
    body: text("body"),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    drawingCreatedIdx: index("drawing_event_drawing_created_idx").on(t.drawingId, t.createdAt),
  }),
);

/** `projectId = null` rows are notified about drawings in every project. */
export const drawingNotifyRecipients = pgTable(
  "drawing_notify_recipient",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    globalUq: uniqueIndex("drawing_notify_global_uq").on(t.userId).where(sql`"project_id" IS NULL`),
    projectUq: uniqueIndex("drawing_notify_project_uq")
      .on(t.projectId, t.userId)
      .where(sql`"project_id" IS NOT NULL`),
  }),
);

/** Hours an engineer spent on a revision, entered by hand. */
export const drawingTimeEntries = pgTable(
  "drawing_time_entry",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    drawingId: text("drawing_id").notNull().references(() => drawings.id, { onDelete: "cascade" }),
    revisionId: text("revision_id").notNull().references(() => drawingRevisions.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    hours: numeric("hours", { precision: 6, scale: 2, mode: "number" }).notNull(),
    workDate: date("work_date").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    drawingIdx: index("drawing_time_drawing_idx").on(t.drawingId),
    userIdx: index("drawing_time_user_idx").on(t.userId),
  }),
);

/**
 * A remark raised against a revision (by the client, the site or internally).
 * It stays open until someone resolves it, usually in a later revision.
 */
export const drawingRemarks = pgTable(
  "drawing_remark",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    drawingId: text("drawing_id").notNull().references(() => drawings.id, { onDelete: "cascade" }),
    revisionId: text("revision_id").notNull().references(() => drawingRevisions.id, { onDelete: "cascade" }),
    source: drawingRemarkSourceEnum("source").notNull(),
    body: text("body").notNull(),
    raisedById: text("raised_by_id").references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at"),
    resolvedById: text("resolved_by_id").references(() => user.id, { onDelete: "set null" }),
    resolvedInRevisionId: text("resolved_in_revision_id").references(() => drawingRevisions.id, { onDelete: "set null" }),
    resolution: text("resolution"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    drawingIdx: index("drawing_remark_drawing_idx").on(t.drawingId),
  }),
);

/**
 * Record of a revision issued to someone. App users (e.g. the site foreman)
 * are emailed and acknowledge receipt; external parties are record-only.
 */
export const drawingTransmittals = pgTable(
  "drawing_transmittal",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    drawingId: text("drawing_id").notNull().references(() => drawings.id, { onDelete: "cascade" }),
    revisionId: text("revision_id").notNull().references(() => drawingRevisions.id, { onDelete: "cascade" }),
    purpose: drawingTransmittalPurposeEnum("purpose").notNull(),
    recipientUserId: text("recipient_user_id").references(() => user.id, { onDelete: "set null" }),
    /** Set instead of `recipientUserId` for someone without an account. */
    externalName: text("external_name"),
    note: text("note"),
    sentById: text("sent_by_id").references(() => user.id, { onDelete: "set null" }),
    acknowledgedAt: timestamp("acknowledged_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    drawingIdx: index("drawing_transmittal_drawing_idx").on(t.drawingId),
    recipientIdx: index("drawing_transmittal_recipient_idx").on(t.recipientUserId),
  }),
);

/**
 * Extra people who get the daily reminder digest ("managers").
 * `projectId = null` rows cover every project.
 */
export const drawingReminderRecipients = pgTable(
  "drawing_reminder_recipient",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    globalUq: uniqueIndex("drawing_reminder_global_uq").on(t.userId).where(sql`"project_id" IS NULL`),
    projectUq: uniqueIndex("drawing_reminder_project_uq")
      .on(t.projectId, t.userId)
      .where(sql`"project_id" IS NOT NULL`),
  }),
);

/** One row per Tbilisi day the scheduled digest ran — the primary key keeps it to once a day. */
export const drawingReminderRuns = pgTable("drawing_reminder_run", {
  day: date("day").primaryKey(),
  recipients: integer("recipients").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});
