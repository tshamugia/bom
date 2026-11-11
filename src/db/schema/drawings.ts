import { pgTable, pgEnum, text, integer, numeric, boolean, timestamp, date, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { projects } from "./projects";
import { user } from "./auth";
import { DRAWING_STATUSES } from "../../lib/drawing-status";
import { REMARK_SOURCES, TRANSMITTAL_PURPOSES } from "../../lib/drawing-meta";
import { CHECK_RUN_STATUSES, type CheckConfigSnapshot, type CheckCounts, type CheckFinding } from "../../lib/drawing-checks";
import type { CheckSeverity } from "../../lib/drawing-check-rules";
import type { SheetCheck } from "../../lib/drawing-check-link";

export const drawingStatusEnum = pgEnum("drawing_status", DRAWING_STATUSES);
export const drawingRemarkSourceEnum = pgEnum("drawing_remark_source", REMARK_SOURCES);
export const drawingTransmittalPurposeEnum = pgEnum("drawing_transmittal_purpose", TRANSMITTAL_PURPOSES);

export const drawingEventKindEnum = pgEnum("drawing_event_kind", [
  "created",
  "updated",
  "status",
  "comment",
  "file",
  "check",
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
    /** Where the drawing files sit on the company file server, e.g. `2026/BMW/CCTV` — the app stores no files. */
    fileLocation: text("file_location"),
    /**
     * Zone-floor-system-number from the standard file name, e.g. `ZZ-00-FA-102`
     * (`src/lib/drawing-check-link.ts`). Set when a DXF is first linked to the
     * drawing by hand, or typed in Edit; DXFs then have to carry exactly this code.
     */
    sheetCode: text("sheet_code"),
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
    // `ZZ-00-FA-102` repeats across projects; within one it names one drawing.
    projectSheetCodeUq: uniqueIndex("drawing_project_sheet_code_uq")
      .on(t.projectId, t.sheetCode)
      .where(sql`"deleted_at" IS NULL AND "sheet_code" IS NOT NULL`),
  }),
);

export const drawingRevisions = pgTable(
  "drawing_revision",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    drawingId: text("drawing_id").notNull().references(() => drawings.id, { onDelete: "cascade" }),
    /** Running number (1, 2…): what "latest", "newer" and "outdated" compare. Never shown on its own. */
    number: integer("number").notNull(),
    /**
     * C-series number (NAMING §6): given to the revision that first reaches Approved A/B
     * or As Built, and to every revision after it. Once set it stays — C never goes back to P.
     */
    cNumber: integer("c_number"),
    /** What people call the revision: P01, P02… until the drawing is approved, C01, C02… from then on. */
    label: text("label").notNull().generatedAlwaysAs(
      sql`CASE WHEN "c_number" IS NOT NULL THEN 'C' || lpad("c_number"::text, greatest(2, length("c_number"::text)), '0') ELSE 'P' || lpad("number"::text, greatest(2, length("number"::text)), '0') END`,
    ),
    status: drawingStatusEnum("status").notNull().default("in-progress"),
    commitMessage: text("commit_message").notNull(),
    /** False when the revision doesn't touch the BOM (layout, annotations…) — BOMs built from earlier revisions stay current. */
    bomImpact: boolean("bom_impact").notNull().default(true),
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
    drawingCNumberUq: uniqueIndex("drawing_rev_drawing_c_number_uq").on(t.drawingId, t.cNumber).where(sql`"c_number" IS NOT NULL`),
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

export const drawingFileStatusEnum = pgEnum("drawing_file_status", ["pending", "ready"]);

/**
 * The PDF of a drawing revision, stored in the S3 bucket under `objectKey`.
 * A row starts `pending` when the upload URL is handed out and turns `ready`
 * once the server has checked the stored bytes. Replacing or removing a PDF
 * archives the row; the object stays in the bucket.
 */
export const drawingFiles = pgTable(
  "drawing_file",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    drawingId: text("drawing_id").notNull().references(() => drawings.id, { onDelete: "cascade" }),
    revisionId: text("revision_id").notNull().references(() => drawingRevisions.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    /** The revision label when the PDF was uploaded (P02 stays P02 after the revision is approved); downloads are named `<code>_<label>.pdf`. */
    revisionLabel: text("revision_label"),
    /** What the engineer called the file. */
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    status: drawingFileStatusEnum("status").notNull().default("pending"),
    uploadedById: text("uploaded_by_id").references(() => user.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at"),
    archivedAt: timestamp("archived_at"),
    archivedById: text("archived_by_id").references(() => user.id, { onDelete: "set null" }),
    archiveReason: text("archive_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    objectKeyUq: uniqueIndex("drawing_file_object_key_uq").on(t.objectKey),
    drawingIdx: index("drawing_file_drawing_idx").on(t.drawingId),
    // One current PDF per revision; replacing it archives the old row first.
    revisionCurrentUq: uniqueIndex("drawing_file_revision_current_uq")
      .on(t.revisionId)
      .where(sql`"status" = 'ready' AND "archived_at" IS NULL`),
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
    /** Set on `check` remarks: the rule they report. One open remark per rule per drawing. */
    checkRuleId: text("check_rule_id"),
    /** ERROR or WARNING ("to check") from the latest run that reported the rule. */
    checkSeverity: text("check_severity").$type<CheckSeverity>(),
    /** The run that last created, updated or closed this remark. */
    lastCheckRunId: text("last_check_run_id").references(() => drawingCheckRuns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    drawingIdx: index("drawing_remark_drawing_idx").on(t.drawingId),
    openCheckRuleUq: uniqueIndex("drawing_remark_open_check_rule_uq")
      .on(t.drawingId, t.checkRuleId)
      .where(sql`"resolved_at" IS NULL AND "check_rule_id" IS NOT NULL`),
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
    /** The revision label at the time of issue: P02 sent for review stays P02 when the revision is later approved as C01. */
    revisionLabel: text("revision_label"),
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

export const drawingCheckStatusEnum = pgEnum("drawing_check_status", CHECK_RUN_STATUSES);

/** What the checker said besides the findings (see services/dxf-checker/README.md). */
export type DrawingCheckDetails = {
  standards?: Record<string, unknown> | null;
  parsedName?: Record<string, unknown> | null;
  titleblock?: Record<string, unknown> | null;
  stats?: Record<string, unknown> | null;
  ignoredRules?: string[];
  durationMs?: number | null;
};

/** Remark ids a run created, updated and closed — and why it changed none, when it didn't. */
export type DrawingCheckRemarkChanges = {
  created: string[];
  updated: string[];
  closed: string[];
  skipped?: "newer-check";
  /** Updated and closed remarks as they were before, so "Wrong file" can put them back. */
  previous?: Array<{ id: string; body: string; severity: CheckSeverity | null; lastCheckRunId: string | null }>;
};

/**
 * One automatic check of a DXF uploaded to a drawing revision (issue #18). The
 * DXF only lives in the bucket until the checker has answered; the row keeps
 * its name, size, SHA-256 and the result.
 */
export const drawingCheckRuns = pgTable(
  "drawing_check_run",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    drawingId: text("drawing_id").notNull().references(() => drawings.id, { onDelete: "cascade" }),
    revisionId: text("revision_id").notNull().references(() => drawingRevisions.id, { onDelete: "cascade" }),
    /** The revision label at upload: a P02 check stays P02 after the revision is approved. */
    revisionLabel: text("revision_label").notNull(),
    uploadedById: text("uploaded_by_id").references(() => user.id, { onDelete: "set null" }),
    originalName: text("original_name").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256"),
    objectKey: text("object_key").notNull(),
    status: drawingCheckStatusEnum("status").notNull().default("pending"),
    /** NOT_DXF, X-READ, DOWNLOAD, TOO_LARGE, TIMEOUT, MEMORY, INTERNAL from the checker; UNREACHABLE, BUSY, REFUSED, STALE from the app. */
    errorCode: text("error_code"),
    error: text("error"),
    configVersion: integer("config_version").notNull().default(0),
    configSnapshot: jsonb("config_snapshot").$type<CheckConfigSnapshot>(),
    findings: jsonb("findings").$type<CheckFinding[]>(),
    counts: jsonb("counts").$type<CheckCounts>(),
    details: jsonb("details").$type<DrawingCheckDetails>(),
    remarkChanges: jsonb("remark_changes").$type<DrawingCheckRemarkChanges>(),
    /** How the title block compared with the drawing's sheet code when the result came in. */
    sheetCheck: text("sheet_check").$type<SheetCheck>(),
    /** The sheet code this upload gave the drawing (its first link by hand); "Wrong file" takes it back. */
    linkedSheetCode: text("linked_sheet_code"),
    /** When its Remark changes were written — "Wrong file" only undoes the drawing's latest. */
    appliedAt: timestamp("applied_at"),
    /** Who confirmed a held run or marked the run as the wrong file, and when. */
    decidedById: text("decided_by_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at"),
    engineVersion: text("engine_version"),
    /** When the checker accepted the file. */
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    drawingCreatedIdx: index("drawing_check_run_drawing_created_idx").on(t.drawingId, t.createdAt),
    objectKeyUq: uniqueIndex("drawing_check_run_object_key_uq").on(t.objectKey),
    // One upload or check at a time per revision.
    revisionActiveUq: uniqueIndex("drawing_check_run_revision_active_uq")
      .on(t.revisionId)
      .where(sql`"status" IN ('pending', 'queued')`),
  }),
);

export const DRAWING_CHECK_CONFIG_ID = "default";

/**
 * The rules and parameters every check is sent with (a single row, edited in
 * Settings → Drawings → DXF check settings). No row means every rule on with
 * the checker's defaults, version 0. Each change bumps `version`; runs keep a snapshot.
 */
export const drawingCheckConfig = pgTable("drawing_check_config", {
  id: text("id").primaryKey().default(DRAWING_CHECK_CONFIG_ID),
  version: integer("version").notNull().default(1),
  /** Parsed with `parseCheckRulesConfig`: `{ disabled: string[], disabledGroups: string[], severity: { [rule]: severity } }`. */
  rules: jsonb("rules").notNull().$type<Record<string, unknown>>().default({}),
  /** Only what differs from rules.yaml, nested like it (`parseParamOverrides`); merged over the checker's defaults. */
  params: jsonb("params").notNull().$type<Record<string, unknown>>().default({}),
  updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
