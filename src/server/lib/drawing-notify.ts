import "server-only";
import { aliasedTable, and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  drawings,
  drawingDisciplines,
  drawingNotifyRecipients,
  drawingRevisions,
  projects,
  user,
} from "@/db/schema";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import type { DrawingStatus, TransitionKind } from "@/lib/drawing-status";
import { audit } from "../audit";
import { buildDrawingStatusDigestEmail, buildDrawingStatusEmail, pickDrawingRecipients } from "./drawing-email";

export type DrawingStatusNotice = {
  revisionId: string;
  from: DrawingStatus;
  to: DrawingStatus;
  kind: TransitionKind;
  comment: string | null;
  actorId: string;
  actorName: string;
};

/** What the status emails say about each changed revision. */
async function loadNoticeRows(revisionIds: string[]) {
  const owner = aliasedTable(user, "owner");
  const reviewer = aliasedTable(user, "reviewer");
  return db
    .select({
      revisionId: drawingRevisions.id,
      drawingId: drawings.id,
      code: drawings.code,
      name: drawings.name,
      dueDate: drawings.dueDate,
      ownerId: drawings.ownerId,
      ownerName: owner.name,
      projectId: projects.id,
      projectCode: projects.code,
      projectName: projects.name,
      discipline: drawingDisciplines.name,
      revisionNumber: drawingRevisions.number,
      commitMessage: drawingRevisions.commitMessage,
      reviewerId: drawingRevisions.reviewerId,
      reviewerName: reviewer.name,
    })
    .from(drawingRevisions)
    .innerJoin(drawings, eq(drawings.id, drawingRevisions.drawingId))
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .leftJoin(drawingDisciplines, eq(drawingDisciplines.id, drawings.disciplineId))
    .leftJoin(owner, eq(owner.id, drawings.ownerId))
    .leftJoin(reviewer, eq(reviewer.id, drawingRevisions.reviewerId))
    .where(inArray(drawingRevisions.id, revisionIds));
}

type NoticeRow = Awaited<ReturnType<typeof loadNoticeRows>>[number];

/** Per revision: the user ids to email — owner, reviewer and followers, minus whoever made the change. */
async function recipientIds(rows: NoticeRow[], actorId: string): Promise<Map<string, string[]>> {
  const projectIds = [...new Set(rows.map(r => r.projectId))];
  const followers = await db
    .select({ userId: drawingNotifyRecipients.userId, projectId: drawingNotifyRecipients.projectId })
    .from(drawingNotifyRecipients)
    .where(or(isNull(drawingNotifyRecipients.projectId), inArray(drawingNotifyRecipients.projectId, projectIds)));
  const globalUserIds = followers.filter(f => f.projectId === null).map(f => f.userId);
  return new Map(rows.map(row => [
    row.revisionId,
    pickDrawingRecipients({
      globalUserIds,
      projectUserIds: followers.filter(f => f.projectId === row.projectId).map(f => f.userId),
      ownerId: row.ownerId,
      reviewerId: row.reviewerId,
      actorId,
    }),
  ]));
}

/** Email addresses of the users who can still receive mail, by user id. */
async function activeEmails(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(and(inArray(user.id, ids), eq(user.disabled, false)));
  return new Map(rows.map(r => [r.id, r.email]));
}

function singleEmail(row: NoticeRow, n: DrawingStatusNotice) {
  return buildDrawingStatusEmail({
    appUrl: env.NEXT_PUBLIC_BETTER_AUTH_URL,
    drawingId: row.drawingId,
    projectCode: row.projectCode,
    projectName: row.projectName,
    code: row.code,
    name: row.name,
    discipline: row.discipline,
    revisionNumber: row.revisionNumber,
    from: n.from,
    to: n.to,
    kind: n.kind,
    actorName: n.actorName,
    ownerName: row.ownerName,
    reviewerName: row.reviewerName,
    dueDate: row.dueDate,
    commitMessage: row.commitMessage,
    comment: n.comment,
  });
}

/** Records on the drawing who its status email reached, or why it didn't go out. */
async function auditDelivery(row: NoticeRow, to: string[], result: Awaited<ReturnType<typeof sendMail>>) {
  const payload = { projectId: row.projectId, revisionId: row.revisionId, to };
  if (result.sent) {
    await audit({
      kind: "drawing.notification.sent",
      refType: "drawing",
      refId: row.drawingId,
      summary: `${row.code} status email sent to ${to.length} recipient${to.length === 1 ? "" : "s"}`,
      payload,
    });
  } else {
    const detail = result.reason === "SMTP_SEND_FAILED" ? result.detail : "SMTP is not configured";
    await audit({
      kind: "drawing.notification.failed",
      refType: "drawing",
      refId: row.drawingId,
      summary: `${row.code} status email failed: ${detail}`,
      payload: { ...payload, reason: result.reason },
    });
  }
}

/**
 * Emails everyone following the drawing about a status change. Runs after the
 * response (via `after()`), so a mail failure is recorded in the audit log
 * instead of failing the status change itself.
 */
export async function notifyDrawingStatusChange(n: DrawingStatusNotice): Promise<void> {
  try {
    const [row] = await loadNoticeRows([n.revisionId]);
    if (!row) return;
    const ids = (await recipientIds([row], n.actorId)).get(row.revisionId) ?? [];
    const to = [...(await activeEmails(ids)).values()];
    if (to.length === 0) return;

    const { subject, text } = singleEmail(row, n);
    await auditDelivery(row, to, await sendMail({ to, subject, text }));
  } catch (e) {
    console.error("[drawings] status notification failed", e);
  }
}

/**
 * A bulk status change (one new status for many drawings): each person gets
 * one email listing every changed drawing they follow, instead of one email
 * per drawing. People who follow the same drawings share an email; someone
 * who follows only one of them gets the usual single-drawing email.
 */
export async function notifyDrawingStatusChanges(notices: DrawingStatusNotice[]): Promise<void> {
  if (notices.length <= 1) {
    if (notices[0]) await notifyDrawingStatusChange(notices[0]);
    return;
  }
  try {
    const { actorId, actorName, to: status, comment } = notices[0];
    const noticeOf = new Map(notices.map(n => [n.revisionId, n]));
    const rows = (await loadNoticeRows(notices.map(n => n.revisionId)))
      .sort((a, b) => a.projectCode.localeCompare(b.projectCode) || a.code.localeCompare(b.code));
    const recipients = await recipientIds(rows, actorId);
    const emails = await activeEmails([...new Set([...recipients.values()].flat())]);

    const groups = new Map<string, { rows: NoticeRow[]; to: string[] }>();
    for (const [userId, email] of emails) {
      const theirs = rows.filter(r => recipients.get(r.revisionId)?.includes(userId));
      if (theirs.length === 0) continue;
      const key = theirs.map(r => r.revisionId).join(",");
      const group = groups.get(key) ?? { rows: theirs, to: [] };
      group.to.push(email);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      const { subject, text } = group.rows.length === 1
        ? singleEmail(group.rows[0], noticeOf.get(group.rows[0].revisionId)!)
        : buildDrawingStatusDigestEmail({
            appUrl: env.NEXT_PUBLIC_BETTER_AUTH_URL,
            to: status,
            actorName,
            reviewerName: group.rows[0].reviewerName,
            comment,
            items: group.rows.map(r => ({
              drawingId: r.drawingId,
              projectCode: r.projectCode,
              code: r.code,
              name: r.name,
              revisionNumber: r.revisionNumber,
              from: noticeOf.get(r.revisionId)!.from,
              kind: noticeOf.get(r.revisionId)!.kind,
            })),
          });
      const result = await sendMail({ to: group.to, subject, text });
      for (const row of group.rows) await auditDelivery(row, group.to, result);
    }
  } catch (e) {
    console.error("[drawings] bulk status notification failed", e);
  }
}
