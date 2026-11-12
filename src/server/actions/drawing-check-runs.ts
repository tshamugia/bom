"use server";

import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingRevisions, drawings, projects } from "@/db/schema";
import { MAX_BULK_DRAWINGS } from "@/lib/drawing-bulk";
import { CHECK_UPLOAD_BLOCK_MESSAGE, checkUploadBlock } from "@/lib/drawing-checks";
import { planBulkCheck, type BulkCheckPlan } from "@/lib/drawing-check-link";
import { READ_ONLY_ERROR, canEdit } from "@/lib/roles";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { activeCheckRevisionIds, closeStaleCheckRuns, loadDrawingCheckEnabled } from "../lib/drawing-check-config";
import { confirmHeldRun, markRunWrongFile } from "../lib/drawing-check-result";
import { revalidateDrawingViews } from "../lib/drawing-lookup";
import { sheetCodesOutside, sheetKey } from "../lib/drawing-sheet-codes";
import { dxfCheckerSetup } from "../lib/dxf-checker";
import type { DrawingActionResult } from "./drawings";

// Bulk DXF upload from /drawings and what a person decides about a finished
// run (issue #18, comment of 2026-11-10). The upload itself goes file by file
// through `requestBulkDrawingCheckUpload` → bucket → `confirmDrawingCheckUpload`.

const fail = (error: string) => ({ ok: false as const, error });

const Id = z.string().min(1);

const PlanInput = z.object({
  drawingIds: z.array(Id).min(1).max(MAX_BULK_DRAWINGS).transform(ids => [...new Set(ids)]),
  files: z.array(z.object({
    key: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(255),
    size: z.number().int().nonnegative(),
  })).min(1).max(MAX_BULK_DRAWINGS),
  /** File key → drawing id, for files linked by hand. */
  picks: z.record(z.string(), Id).default({}),
});

/**
 * The server's version of the plan the bulk dialog shows (`planBulkCheck`),
 * from fresh rows: it also stops files whose sheet belongs to a drawing that
 * isn't selected, and files for drawings whose check is still running. The
 * dialog uploads only what this returns as ready.
 */
export async function planBulkDrawingChecks(input: z.input<typeof PlanInput>): Promise<DrawingActionResult<{ plan: BulkCheckPlan }>> {
  const data = PlanInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const block = checkUploadBlock({
    enabled: await loadDrawingCheckEnabled(),
    configured: dxfCheckerSetup() !== null,
    isLatest: true,
    running: false,
  });
  if (block) return fail(CHECK_UPLOAD_BLOCK_MESSAGE[block]);

  const rows = await db
    .select({
      id: drawings.id,
      code: drawings.code,
      projectId: drawings.projectId,
      projectCode: projects.code,
      sheetCode: drawings.sheetCode,
    })
    .from(drawings)
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .where(and(inArray(drawings.id, data.drawingIds), isNull(drawings.deletedAt), isNull(projects.deletedAt)));
  if (rows.length === 0) return fail("None of the selected drawings was found.");

  await closeStaleCheckRuns();
  const latest = await db
    .selectDistinctOn([drawingRevisions.drawingId], { drawingId: drawingRevisions.drawingId, id: drawingRevisions.id })
    .from(drawingRevisions)
    .where(inArray(drawingRevisions.drawingId, rows.map(r => r.id)))
    .orderBy(drawingRevisions.drawingId, desc(drawingRevisions.number));
  const running = await activeCheckRevisionIds(latest.map(l => l.id));
  const busy = new Set(latest.filter(l => running.has(l.id)).map(l => l.drawingId));
  const taken = await sheetCodesOutside([...new Set(rows.map(r => r.projectId))], rows.map(r => r.id));

  const plan = planBulkCheck({
    drawings: rows,
    files: data.files,
    picks: data.picks,
    takenBy: (projectId, sheetCode) => taken.get(sheetKey(projectId, sheetCode)) ?? null,
    drawingBlock: id => (busy.has(id) ? CHECK_UPLOAD_BLOCK_MESSAGE.RUNNING : null),
  });
  return { ok: true, plan };
}

const RunInput = z.object({ runId: Id });

/** A held run (its title block names another sheet): "it is this drawing's file" — its findings become Remarks. */
export async function confirmDrawingCheckRun(input: z.infer<typeof RunInput>): Promise<DrawingActionResult<{ summary: string }>> {
  const { runId } = RunInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const res = await confirmHeldRun(runId, session.user.id);
  if (!res.ok) return res;
  revalidateDrawingViews(res.drawingId, res.projectId);
  await audit(res.audit);
  return { ok: true, summary: res.summary };
}

/** "Wrong file": undoes what the run changed (or sets a held run aside) and takes back the sheet code it linked. */
export async function markDrawingCheckWrongFile(input: z.infer<typeof RunInput>): Promise<DrawingActionResult<{ summary: string }>> {
  const { runId } = RunInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const res = await markRunWrongFile(runId, session.user.id);
  if (!res.ok) return res;
  revalidateDrawingViews(res.drawingId, res.projectId);
  await audit(res.audit);
  return { ok: true, summary: res.summary };
}
