"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingRevisions, drawingTimeEntries, drawings } from "@/db/schema";
import { MAX_ENTRY_HOURS, formatHours } from "@/lib/drawing-meta";
import { formatDrawingRevision, todayIso } from "@/lib/drawing-status";
import { READ_ONLY_ERROR, canEdit, roleOf } from "@/lib/roles";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { findDrawingRevision, revalidateDrawingViews } from "../lib/drawing-lookup";
import type { DrawingActionResult } from "./drawings";

const fail = (error: string) => ({ ok: false as const, error });

const LogInput = z.object({
  revisionId: z.string().min(1),
  hours: z.number().positive().max(MAX_ENTRY_HOURS),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional(),
});

/** Engineers log their own hours; the total is compared with the drawing's estimate. */
export async function logDrawingTime(input: z.infer<typeof LogInput>): Promise<DrawingActionResult> {
  const data = LogInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  if (data.workDate > todayIso()) return fail("Time can't be logged for a future date.");

  const rev = await findDrawingRevision(data.revisionId);
  if (!rev) return fail("Revision not found.");

  const hours = Math.round(data.hours * 100) / 100;
  await db.insert(drawingTimeEntries).values({
    drawingId: rev.drawingId,
    revisionId: rev.id,
    userId: session.user.id,
    hours,
    workDate: data.workDate,
    note: data.note || null,
  });

  revalidateDrawingViews(rev.drawingId, rev.projectId);
  await audit({
    kind: "drawing.time.logged",
    refType: "drawing",
    refId: rev.drawingId,
    summary: `${formatHours(hours)} logged on ${rev.code} ${formatDrawingRevision(rev.number)}`,
    payload: { projectId: rev.projectId, revisionId: rev.id, hours, workDate: data.workDate },
  });
  return { ok: true };
}

/** Your own entries, or anyone's if you are an admin. */
export async function deleteDrawingTime(input: { id: string }): Promise<DrawingActionResult> {
  const id = z.string().min(1).parse(input.id);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const role = roleOf(session.user);

  const [entry] = await db
    .select({
      userId: drawingTimeEntries.userId,
      hours: drawingTimeEntries.hours,
      drawingId: drawings.id,
      code: drawings.code,
      projectId: drawings.projectId,
      revisionNumber: drawingRevisions.number,
    })
    .from(drawingTimeEntries)
    .innerJoin(drawings, eq(drawings.id, drawingTimeEntries.drawingId))
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingTimeEntries.revisionId))
    .where(and(eq(drawingTimeEntries.id, id), isNull(drawings.deletedAt)))
    .limit(1);
  if (!entry) return fail("Time entry not found.");
  if (entry.userId !== session.user.id && role !== "admin") {
    return fail("You can only remove your own time entries.");
  }

  await db.delete(drawingTimeEntries).where(eq(drawingTimeEntries.id, id));

  revalidateDrawingViews(entry.drawingId, entry.projectId);
  await audit({
    kind: "drawing.time.deleted",
    refType: "drawing",
    refId: entry.drawingId,
    summary: `${formatHours(entry.hours)} removed from ${entry.code} ${formatDrawingRevision(entry.revisionNumber)}`,
    payload: { projectId: entry.projectId, entryId: id, hours: entry.hours },
  });
  return { ok: true };
}
