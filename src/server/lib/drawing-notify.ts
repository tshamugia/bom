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
import { buildDrawingStatusEmail, pickDrawingRecipients } from "./drawing-email";

export type DrawingStatusNotice = {
  revisionId: string;
  from: DrawingStatus;
  to: DrawingStatus;
  kind: TransitionKind;
  comment: string | null;
  actorId: string;
  actorName: string;
};

/**
 * Emails everyone following the drawing about a status change. Runs after the
 * response (via `after()`), so a mail failure is recorded in the audit log
 * instead of failing the status change itself.
 */
export async function notifyDrawingStatusChange(n: DrawingStatusNotice): Promise<void> {
  try {
    const owner = aliasedTable(user, "owner");
    const reviewer = aliasedTable(user, "reviewer");
    const [row] = await db
      .select({
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
      .where(eq(drawingRevisions.id, n.revisionId))
      .limit(1);
    if (!row) return;

    const followers = await db
      .select({ userId: drawingNotifyRecipients.userId, projectId: drawingNotifyRecipients.projectId })
      .from(drawingNotifyRecipients)
      .where(or(isNull(drawingNotifyRecipients.projectId), eq(drawingNotifyRecipients.projectId, row.projectId)));

    const ids = pickDrawingRecipients({
      globalUserIds: followers.filter(f => f.projectId === null).map(f => f.userId),
      projectUserIds: followers.filter(f => f.projectId !== null).map(f => f.userId),
      ownerId: row.ownerId,
      reviewerId: row.reviewerId,
      actorId: n.actorId,
    });
    if (ids.length === 0) return;

    const recipients = await db
      .select({ email: user.email })
      .from(user)
      .where(and(inArray(user.id, ids), eq(user.disabled, false)));
    const to = recipients.map(r => r.email);
    if (to.length === 0) return;

    const { subject, text } = buildDrawingStatusEmail({
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

    const result = await sendMail({ to, subject, text });
    const payload = { projectId: row.projectId, revisionId: n.revisionId, to };
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
  } catch (e) {
    console.error("[drawings] status notification failed", e);
  }
}
