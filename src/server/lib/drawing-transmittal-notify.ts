import "server-only";
import { aliasedTable, and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingRevisions, drawingTransmittals, drawings, projects, user } from "@/db/schema";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { audit } from "../audit";
import { buildTransmittalEmail } from "./drawing-email";

/**
 * Emails each app-user recipient of the given transmittals. Runs after the
 * response (via `after()`), so a mail failure is audited instead of failing the issue.
 */
export async function notifyTransmittals(ids: string[], senderName: string): Promise<void> {
  if (ids.length === 0) return;
  try {
    const recipient = aliasedTable(user, "recipient");
    const rows = await db
      .select({
        drawingId: drawings.id,
        code: drawings.code,
        name: drawings.name,
        projectId: projects.id,
        projectCode: projects.code,
        projectName: projects.name,
        revisionNumber: drawingRevisions.number,
        status: drawingRevisions.status,
        purpose: drawingTransmittals.purpose,
        note: drawingTransmittals.note,
        recipientName: recipient.name,
        recipientEmail: recipient.email,
      })
      .from(drawingTransmittals)
      .innerJoin(drawings, eq(drawings.id, drawingTransmittals.drawingId))
      .innerJoin(projects, eq(projects.id, drawings.projectId))
      .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingTransmittals.revisionId))
      .innerJoin(recipient, eq(recipient.id, drawingTransmittals.recipientUserId))
      .where(and(inArray(drawingTransmittals.id, ids), eq(recipient.disabled, false)));

    for (const r of rows) {
      const { subject, text } = buildTransmittalEmail({
        appUrl: env.NEXT_PUBLIC_BETTER_AUTH_URL,
        drawingId: r.drawingId,
        projectCode: r.projectCode,
        projectName: r.projectName,
        code: r.code,
        name: r.name,
        revisionNumber: r.revisionNumber,
        status: r.status,
        purpose: r.purpose,
        senderName,
        recipientName: r.recipientName,
        note: r.note,
      });
      const result = await sendMail({ to: r.recipientEmail, subject, text });
      const payload = { projectId: r.projectId, to: [r.recipientEmail] };
      if (result.sent) {
        await audit({
          kind: "drawing.notification.sent",
          refType: "drawing",
          refId: r.drawingId,
          summary: `${r.code} transmittal email sent to ${r.recipientName}`,
          payload,
        });
      } else {
        const detail = result.reason === "SMTP_SEND_FAILED" ? result.detail : "SMTP is not configured";
        await audit({
          kind: "drawing.notification.failed",
          refType: "drawing",
          refId: r.drawingId,
          summary: `${r.code} transmittal email to ${r.recipientName} failed: ${detail}`,
          payload: { ...payload, reason: result.reason },
        });
      }
    }
  } catch (e) {
    console.error("[drawings] transmittal notification failed", e);
  }
}
