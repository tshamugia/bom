import "server-only";
import { aliasedTable, and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  drawingEvents,
  drawingReminderRecipients,
  drawingReminderRuns,
  drawingRemarks,
  drawingRevisions,
  drawingTransmittals,
  drawings,
  projects,
  systemSettings,
  SYSTEM_SETTINGS_ID,
  user,
} from "@/db/schema";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { todayIso } from "@/lib/drawing-status";
import {
  buildReminderDigestEmail,
  collectReminders,
  isReminderTime,
  parseReminderConfig,
  type ReminderConfig,
  type ReminderDrawing,
  type ReminderTransmittal,
} from "@/lib/drawing-reminders";
import { audit } from "../audit";

/**
 * Raw aggregates skip Drizzle's column mapping and arrive as zone-less text.
 * Columns are `timestamp` holding UTC, so read them as UTC like Drizzle does —
 * `new Date(text)` alone would use the server's local zone.
 */
function utcDate(v: string | Date | null): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  return new Date(/(Z|[+-]\d{2}(:?\d{2})?)$/.test(v) ? v : `${v.replace(" ", "T")}Z`);
}

export async function loadReminderConfig(): Promise<ReminderConfig> {
  const [row] = await db
    .select({ raw: systemSettings.drawingReminders })
    .from(systemSettings)
    .where(eq(systemSettings.id, SYSTEM_SETTINGS_ID))
    .limit(1);
  return parseReminderConfig(row?.raw);
}

async function loadReminderDrawings(): Promise<ReminderDrawing[]> {
  const latest = db
    .selectDistinctOn([drawingRevisions.drawingId], {
      drawingId: drawingRevisions.drawingId,
      revisionId: drawingRevisions.id,
      number: drawingRevisions.number,
      status: drawingRevisions.status,
      reviewerId: drawingRevisions.reviewerId,
    })
    .from(drawingRevisions)
    .orderBy(drawingRevisions.drawingId, desc(drawingRevisions.number))
    .as("latest");
  const requested = db
    .select({
      revisionId: drawingEvents.revisionId,
      at: sql<string | null>`max(${drawingEvents.createdAt})`.as("requested_at"),
    })
    .from(drawingEvents)
    .where(and(eq(drawingEvents.kind, "status"), eq(drawingEvents.toStatus, "need-approval")))
    .groupBy(drawingEvents.revisionId)
    .as("requested");
  const remarks = db
    .select({
      drawingId: drawingRemarks.drawingId,
      open: sql<number>`count(*)`.as("open_count"),
      oldest: sql<string | null>`min(${drawingRemarks.createdAt})`.as("oldest_at"),
    })
    .from(drawingRemarks)
    .where(isNull(drawingRemarks.resolvedAt))
    .groupBy(drawingRemarks.drawingId)
    .as("open_remarks");
  const reviewer = aliasedTable(user, "reviewer");

  const rows = await db
    .select({
      id: drawings.id,
      code: drawings.code,
      name: drawings.name,
      projectId: projects.id,
      projectCode: projects.code,
      revisionNumber: latest.number,
      status: latest.status,
      dueDate: drawings.dueDate,
      ownerId: drawings.ownerId,
      reviewerId: latest.reviewerId,
      reviewerName: reviewer.name,
      needApprovalSince: requested.at,
      openRemarks: sql<number>`coalesce(${remarks.open}, 0)`.mapWith(Number),
      oldestOpenRemarkAt: remarks.oldest,
    })
    .from(drawings)
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .innerJoin(latest, eq(latest.drawingId, drawings.id))
    .leftJoin(reviewer, eq(reviewer.id, latest.reviewerId))
    .leftJoin(requested, eq(requested.revisionId, latest.revisionId))
    .leftJoin(remarks, eq(remarks.drawingId, drawings.id))
    .where(and(isNull(drawings.deletedAt), isNull(projects.deletedAt)));

  return rows.map(r => ({
    ...r,
    needApprovalSince: utcDate(r.needApprovalSince),
    oldestOpenRemarkAt: utcDate(r.oldestOpenRemarkAt),
  }));
}

/** Unacknowledged transmittals of the drawing's current revision, to active app users. */
async function loadOpenTransmittals(): Promise<ReminderTransmittal[]> {
  const latest = db
    .selectDistinctOn([drawingRevisions.drawingId], {
      drawingId: drawingRevisions.drawingId,
      revisionId: drawingRevisions.id,
    })
    .from(drawingRevisions)
    .orderBy(drawingRevisions.drawingId, desc(drawingRevisions.number))
    .as("latest");
  const recipient = aliasedTable(user, "recipient");
  const rows = await db
    .select({
      id: drawingTransmittals.id,
      drawingId: drawings.id,
      code: drawings.code,
      name: drawings.name,
      projectId: projects.id,
      projectCode: projects.code,
      revisionNumber: drawingRevisions.number,
      purpose: drawingTransmittals.purpose,
      recipientUserId: drawingTransmittals.recipientUserId,
      recipientName: recipient.name,
      sentById: drawingTransmittals.sentById,
      createdAt: drawingTransmittals.createdAt,
    })
    .from(drawingTransmittals)
    .innerJoin(drawings, eq(drawings.id, drawingTransmittals.drawingId))
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingTransmittals.revisionId))
    .innerJoin(latest, eq(latest.revisionId, drawingTransmittals.revisionId))
    .innerJoin(recipient, eq(recipient.id, drawingTransmittals.recipientUserId))
    .where(and(
      isNull(drawingTransmittals.acknowledgedAt),
      isNotNull(drawingTransmittals.recipientUserId),
      eq(recipient.disabled, false),
      isNull(drawings.deletedAt),
      isNull(projects.deletedAt),
    ));
  return rows.map(r => ({ ...r, recipientUserId: r.recipientUserId! }));
}

export type ReminderRunResult =
  | { status: "skipped"; reason: "not-time" | "already-ran" }
  | { status: "done"; recipients: number; items: number; failed: number };

/**
 * Builds and mails today's digests. The scheduled run claims the day first
 * (primary key on `drawing_reminder_run.day`), so several server instances or
 * restarts never send twice; a manual run skips both the clock and the claim.
 */
export async function runDrawingReminders(opts: {
  trigger: "schedule" | "manual";
  now?: Date;
}): Promise<ReminderRunResult> {
  const now = opts.now ?? new Date();
  const config = await loadReminderConfig();
  const today = todayIso(now);

  if (opts.trigger === "schedule") {
    if (!isReminderTime(config, now)) return { status: "skipped", reason: "not-time" };
    const claimed = await db
      .insert(drawingReminderRuns)
      .values({ day: today })
      .onConflictDoNothing()
      .returning({ day: drawingReminderRuns.day });
    if (claimed.length === 0) return { status: "skipped", reason: "already-ran" };
  }

  const [reminderDrawings, transmittals, managers] = await Promise.all([
    loadReminderDrawings(),
    loadOpenTransmittals(),
    db.select({ projectId: drawingReminderRecipients.projectId, userId: drawingReminderRecipients.userId })
      .from(drawingReminderRecipients),
  ]);
  const digests = collectReminders({ config, today, drawings: reminderDrawings, transmittals, managers });

  const ids = [...digests.keys()];
  const people = ids.length
    ? await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(and(inArray(user.id, ids), eq(user.disabled, false)))
    : [];

  let sent = 0;
  let items = 0;
  const failures: string[] = [];
  for (const p of people) {
    const list = digests.get(p.id)!;
    const { subject, text } = buildReminderDigestEmail({
      appUrl: env.NEXT_PUBLIC_BETTER_AUTH_URL,
      userName: p.name,
      today,
      items: list,
    });
    const result = await sendMail({ to: p.email, subject, text });
    if (result.sent) {
      sent++;
      items += list.length;
    } else {
      failures.push(`${p.email}: ${result.reason === "SMTP_SEND_FAILED" ? result.detail : "SMTP is not configured"}`);
    }
  }

  if (opts.trigger === "schedule") {
    await db
      .update(drawingReminderRuns)
      .set({ recipients: sent, finishedAt: new Date() })
      .where(eq(drawingReminderRuns.day, today));
  }

  // A quiet scheduled day is not worth an audit row; a manual run always reports back.
  if (sent > 0 || (opts.trigger === "manual" && failures.length === 0)) {
    await audit({
      kind: "drawing.reminders.sent",
      summary: `Drawing reminders (${opts.trigger}) sent to ${sent} ${sent === 1 ? "person" : "people"} — ${items} items`,
      payload: { trigger: opts.trigger, day: today, recipients: sent, items },
    });
  }
  if (failures.length > 0) {
    await audit({
      kind: "drawing.reminders.failed",
      summary: `Drawing reminders failed for ${failures.length} ${failures.length === 1 ? "person" : "people"}: ${failures[0]}`,
      payload: { trigger: opts.trigger, day: today, failures },
    });
  }
  return { status: "done", recipients: sent, items, failed: failures.length };
}
