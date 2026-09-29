"use server";

import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db/client";
import { drawingTransmittals, drawings, user } from "@/db/schema";
import { TRANSMITTAL_PURPOSES, TRANSMITTAL_PURPOSE_LABEL } from "@/lib/drawing-meta";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { READ_ONLY_ERROR, canEdit } from "@/lib/roles";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { findDrawingRevision, revalidateDrawingViews } from "../lib/drawing-lookup";
import { notifyTransmittals } from "../lib/drawing-transmittal-notify";
import type { DrawingActionResult } from "./drawings";

const fail = (error: string) => ({ ok: false as const, error });

const IssueInput = z.object({
  revisionId: z.string().min(1),
  purpose: z.enum(TRANSMITTAL_PURPOSES),
  userIds: z.array(z.string().min(1)).max(50),
  /** Someone without an account (e.g. the client) — recorded only, not emailed. */
  externalName: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
});

/** One transmittal row per recipient, so each can acknowledge on their own. */
export async function issueDrawingTransmittal(
  input: z.infer<typeof IssueInput>,
): Promise<DrawingActionResult<{ count: number }>> {
  const data = IssueInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const userIds = [...new Set(data.userIds)];
  if (userIds.length === 0 && !data.externalName) return fail("Pick at least one recipient.");

  const rev = await findDrawingRevision(data.revisionId);
  if (!rev) return fail("Revision not found.");
  if (!rev.isLatest) return fail("Only the latest revision can be issued.");

  const recipients = userIds.length
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(and(inArray(user.id, userIds), eq(user.disabled, false)))
    : [];
  if (recipients.length !== userIds.length) return fail("Transmittals can only go to active users.");

  const note = data.note || null;
  const values = [
    ...recipients.map(r => ({ recipientUserId: r.id, externalName: null })),
    ...(data.externalName ? [{ recipientUserId: null, externalName: data.externalName }] : []),
  ].map(r => ({
    ...r,
    drawingId: rev.drawingId,
    revisionId: rev.id,
    purpose: data.purpose,
    note,
    sentById: session.user.id,
  }));
  const created = await db.insert(drawingTransmittals).values(values).returning({ id: drawingTransmittals.id });

  revalidateDrawingViews(rev.drawingId, rev.projectId);
  const names = [...recipients.map(r => r.name), ...(data.externalName ? [data.externalName] : [])];
  await audit({
    kind: "drawing.transmittal.sent",
    refType: "drawing",
    refId: rev.drawingId,
    summary: `${rev.code} ${formatDrawingRevision(rev.number)} issued ${TRANSMITTAL_PURPOSE_LABEL[data.purpose].toLowerCase()} to ${names.join(", ")}`,
    payload: { projectId: rev.projectId, revisionId: rev.id, purpose: data.purpose, userIds, externalName: data.externalName ?? null },
  });

  const emailed = created.map(c => c.id);
  const senderName = session.user.name || session.user.email;
  after(() => notifyTransmittals(emailed, senderName));

  return { ok: true, count: created.length };
}

/** Only the recipient confirms they received the revision. */
export async function acknowledgeTransmittal(input: { id: string }): Promise<DrawingActionResult> {
  const id = z.string().min(1).parse(input.id);
  const session = await requireSession();

  const [t] = await db
    .select({
      recipientUserId: drawingTransmittals.recipientUserId,
      acknowledgedAt: drawingTransmittals.acknowledgedAt,
      drawingId: drawings.id,
      code: drawings.code,
      projectId: drawings.projectId,
    })
    .from(drawingTransmittals)
    .innerJoin(drawings, eq(drawings.id, drawingTransmittals.drawingId))
    .where(and(eq(drawingTransmittals.id, id), isNull(drawings.deletedAt)))
    .limit(1);
  if (!t) return fail("Transmittal not found.");
  if (t.recipientUserId !== session.user.id) return fail("Only the recipient can acknowledge this transmittal.");
  if (t.acknowledgedAt) return { ok: true };

  await db
    .update(drawingTransmittals)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(drawingTransmittals.id, id), isNull(drawingTransmittals.acknowledgedAt)));

  revalidateDrawingViews(t.drawingId, t.projectId);
  await audit({
    kind: "drawing.transmittal.acknowledged",
    refType: "drawing",
    refId: t.drawingId,
    summary: `${t.code} transmittal acknowledged by ${session.user.name || session.user.email}`,
    payload: { projectId: t.projectId, transmittalId: id },
  });
  return { ok: true };
}
