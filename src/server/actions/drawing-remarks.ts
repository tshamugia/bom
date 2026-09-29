"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingRemarks, drawings } from "@/db/schema";
import { REMARK_SOURCES, REMARK_SOURCE_LABEL } from "@/lib/drawing-meta";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { READ_ONLY_ERROR, canEdit } from "@/lib/roles";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { findDrawingRevision, findLatestRevision, revalidateDrawingViews } from "../lib/drawing-lookup";
import type { DrawingActionResult } from "./drawings";

const fail = (error: string) => ({ ok: false as const, error });

const AddInput = z.object({
  revisionId: z.string().min(1),
  source: z.enum(REMARK_SOURCES),
  body: z.string().trim().min(1).max(4000),
});

export async function addDrawingRemark(input: z.infer<typeof AddInput>): Promise<DrawingActionResult> {
  const data = AddInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const rev = await findDrawingRevision(data.revisionId);
  if (!rev) return fail("Revision not found.");

  await db.insert(drawingRemarks).values({
    drawingId: rev.drawingId,
    revisionId: rev.id,
    source: data.source,
    body: data.body,
    raisedById: session.user.id,
  });

  revalidateDrawingViews(rev.drawingId, rev.projectId);
  await audit({
    kind: "drawing.remark.added",
    refType: "drawing",
    refId: rev.drawingId,
    summary: `${REMARK_SOURCE_LABEL[data.source]} remark on ${rev.code} ${formatDrawingRevision(rev.number)}`,
    payload: { projectId: rev.projectId, revisionId: rev.id, source: data.source },
  });
  return { ok: true };
}

async function findRemark(id: string) {
  const [r] = await db
    .select({
      id: drawingRemarks.id,
      resolvedAt: drawingRemarks.resolvedAt,
      drawingId: drawings.id,
      code: drawings.code,
      projectId: drawings.projectId,
    })
    .from(drawingRemarks)
    .innerJoin(drawings, eq(drawings.id, drawingRemarks.drawingId))
    .where(and(eq(drawingRemarks.id, id), isNull(drawings.deletedAt)))
    .limit(1);
  return r ?? null;
}

const ResolveInput = z.object({
  id: z.string().min(1),
  resolution: z.string().trim().max(2000).optional(),
});

/** Closes the remark against the drawing's latest revision — the one that addressed it. */
export async function resolveDrawingRemark(input: z.infer<typeof ResolveInput>): Promise<DrawingActionResult> {
  const data = ResolveInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const remark = await findRemark(data.id);
  if (!remark) return fail("Remark not found.");
  if (remark.resolvedAt) return fail("This remark is already resolved.");
  const latest = await findLatestRevision(remark.drawingId);

  await db
    .update(drawingRemarks)
    .set({
      resolvedAt: new Date(),
      resolvedById: session.user.id,
      resolvedInRevisionId: latest?.id ?? null,
      resolution: data.resolution || null,
    })
    .where(and(eq(drawingRemarks.id, data.id), isNull(drawingRemarks.resolvedAt)));

  revalidateDrawingViews(remark.drawingId, remark.projectId);
  await audit({
    kind: "drawing.remark.resolved",
    refType: "drawing",
    refId: remark.drawingId,
    summary: `Remark on ${remark.code} resolved${latest ? ` in ${formatDrawingRevision(latest.number)}` : ""}`,
    payload: { projectId: remark.projectId, remarkId: data.id },
  });
  return { ok: true };
}

export async function reopenDrawingRemark(input: { id: string }): Promise<DrawingActionResult> {
  const id = z.string().min(1).parse(input.id);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const remark = await findRemark(id);
  if (!remark) return fail("Remark not found.");
  if (!remark.resolvedAt) return { ok: true };

  await db
    .update(drawingRemarks)
    .set({ resolvedAt: null, resolvedById: null, resolvedInRevisionId: null, resolution: null })
    .where(eq(drawingRemarks.id, id));

  revalidateDrawingViews(remark.drawingId, remark.projectId);
  await audit({
    kind: "drawing.remark.reopened",
    refType: "drawing",
    refId: remark.drawingId,
    summary: `Remark on ${remark.code} reopened`,
    payload: { projectId: remark.projectId, remarkId: id },
  });
  return { ok: true };
}
