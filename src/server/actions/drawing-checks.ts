"use server";

import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingCheckRuns } from "@/db/schema";
import {
  CHECK_DOWNLOAD_TTL_S, CHECK_UPLOAD_BLOCK_MESSAGE, CHECK_UPLOAD_EXPIRES_S, DXF_CONTENT_TYPE, DXF_FILE_ERROR_MESSAGE,
  MAX_DXF_BYTES, checkConfigSnapshot, checkDxfFile, checkFileRole, checkRequestBody, checkUploadBlock, storedDxfError,
} from "@/lib/drawing-checks";
import { formatFileSize } from "@/lib/drawing-files";
import { READ_ONLY_ERROR, canEdit } from "@/lib/roles";
import { headObject, presignDownload, presignUpload, readObjectStart } from "@/lib/s3";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { isUniqueViolation } from "../lib/db-errors";
import {
  activeCheckRevisionIds, closeStaleCheckRuns, deleteCheckFiles, loadCheckExceptions, loadDrawingCheckConfig,
  loadDrawingCheckEnabled,
} from "../lib/drawing-check-config";
import { findDrawingRevision, revalidateDrawingViews } from "../lib/drawing-lookup";
import { checkCallbackUrl, dxfCheckerSetup, submitCheck } from "../lib/dxf-checker";
import type { DrawingActionResult } from "./drawings";

const fail = (error: string) => ({ ok: false as const, error });

const Id = z.string().min(1);

const EXPIRED = "This upload has expired — upload the DXF again.";

/** The DXF is temporary: it waits here until the checker has read it, then it is deleted. */
const checkObjectKey = (runId: string) => `checks/${runId}.dxf`;

type Revision = NonNullable<Awaited<ReturnType<typeof findDrawingRevision>>>;

/**
 * Why this revision can't take a DXF right now, or null. While confirming its
 * own upload the run is the revision's one active run, so it doesn't block itself.
 */
async function uploadBlockMessage(rev: Revision, confirming = false): Promise<string | null> {
  const [enabled, active] = await Promise.all([
    loadDrawingCheckEnabled(),
    confirming ? Promise.resolve(new Set<string>()) : activeCheckRevisionIds([rev.id]),
  ]);
  const block = checkUploadBlock({
    enabled,
    configured: dxfCheckerSetup() !== null,
    isLatest: rev.isLatest,
    running: active.has(rev.id),
  });
  return block ? CHECK_UPLOAD_BLOCK_MESSAGE[block] : null;
}

const RequestInput = z.object({
  revisionId: Id,
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().nonnegative(),
});

/**
 * Step 1 of a check: any editor, on the drawing's latest revision, while
 * checks are on. Hands back a form the browser posts the DXF to, straight
 * into the bucket, capped at `MAX_DXF_MB`.
 */
export async function requestDrawingCheckUpload(
  input: z.infer<typeof RequestInput>,
): Promise<DrawingActionResult<{ runId: string; url: string; fields: Record<string, string> }>> {
  const data = RequestInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const file = checkDxfFile({ name: data.fileName, size: data.size });
  if (!file.ok) return fail(DXF_FILE_ERROR_MESSAGE[file.error]);

  const rev = await findDrawingRevision(data.revisionId);
  if (!rev) return fail("Revision not found.");
  await closeStaleCheckRuns();
  // Starting over drops the same person's unfinished upload on this revision (a closed tab, a lost connection).
  const own = await db
    .delete(drawingCheckRuns)
    .where(and(
      eq(drawingCheckRuns.revisionId, rev.id),
      eq(drawingCheckRuns.status, "pending"),
      eq(drawingCheckRuns.uploadedById, session.user.id),
    ))
    .returning({ objectKey: drawingCheckRuns.objectKey });
  await deleteCheckFiles(own.map(r => r.objectKey));
  const blocked = await uploadBlockMessage(rev);
  if (blocked) return fail(blocked);

  const runId = createId();
  const objectKey = checkObjectKey(runId);
  try {
    await db.insert(drawingCheckRuns).values({
      id: runId,
      drawingId: rev.drawingId,
      revisionId: rev.id,
      revisionLabel: rev.label,
      uploadedById: session.user.id,
      originalName: data.fileName,
      sizeBytes: data.size,
      objectKey,
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(CHECK_UPLOAD_BLOCK_MESSAGE.RUNNING);
    throw e;
  }
  const { url, fields } = await presignUpload(objectKey, {
    contentType: DXF_CONTENT_TYPE,
    maxBytes: MAX_DXF_BYTES,
    expiresIn: CHECK_UPLOAD_EXPIRES_S,
  });
  return { ok: true, runId, url, fields };
}

/**
 * Step 2: checks what reached the bucket really is a DXF (a renamed DWG is
 * sent back with how to save a DXF), then hands it to the checker. The
 * findings arrive later at /api/internal/drawing-checks/[id]/result.
 */
export async function confirmDrawingCheckUpload(input: { runId: string }): Promise<DrawingActionResult> {
  const runId = Id.parse(input.runId);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const [run] = await db
    .select({
      id: drawingCheckRuns.id,
      revisionId: drawingCheckRuns.revisionId,
      objectKey: drawingCheckRuns.objectKey,
      originalName: drawingCheckRuns.originalName,
    })
    .from(drawingCheckRuns)
    .where(and(
      eq(drawingCheckRuns.id, runId),
      eq(drawingCheckRuns.status, "pending"),
      eq(drawingCheckRuns.uploadedById, session.user.id),
    ))
    .limit(1);
  if (!run) return fail(EXPIRED);
  const discard = async (error: string) => {
    await db.delete(drawingCheckRuns).where(and(eq(drawingCheckRuns.id, run.id), eq(drawingCheckRuns.status, "pending")));
    await deleteCheckFiles([run.objectKey]);
    return fail(error);
  };

  // The switch, the latest revision or the setup may have changed while the file was uploading.
  const rev = await findDrawingRevision(run.revisionId);
  if (!rev) return discard("Revision not found.");
  const blocked = await uploadBlockMessage(rev, true);
  if (blocked) return discard(blocked);
  const setup = dxfCheckerSetup()!;

  const stored = await headObject(run.objectKey);
  if (!stored) return discard("The file didn't reach the storage — upload it again.");
  if (stored.size > MAX_DXF_BYTES) return discard(DXF_FILE_ERROR_MESSAGE.TOO_LARGE);
  const head = await readObjectStart(run.objectKey, 64);
  if (!head || head.length === 0) return discard(DXF_FILE_ERROR_MESSAGE.EMPTY);
  const notDxf = storedDxfError(head);
  if (notDxf) return discard(notDxf);

  // Only what runs on this drawing: rules on in Settings, minus its project's client naming and its false errors.
  const [config, exceptions] = await Promise.all([loadDrawingCheckConfig(), loadCheckExceptions(rev.drawingId)]);
  const snapshot = checkConfigSnapshot(config, exceptions);
  const now = new Date();
  // Queued before the checker hears of it, so even an instant callback finds the run waiting.
  const [queued] = await db
    .update(drawingCheckRuns)
    .set({
      status: "queued",
      sizeBytes: stored.size,
      configVersion: snapshot.version,
      configSnapshot: snapshot,
      startedAt: now,
    })
    .where(and(eq(drawingCheckRuns.id, run.id), eq(drawingCheckRuns.status, "pending")))
    .returning({ id: drawingCheckRuns.id });
  if (!queued) return fail(EXPIRED);

  const sent = await submitCheck(setup, checkRequestBody({
    runId: run.id,
    fileUrl: await presignDownload(run.objectKey, CHECK_DOWNLOAD_TTL_S),
    fileName: run.originalName,
    sizeBytes: stored.size,
    role: checkFileRole(rev.status),
    config: snapshot,
    callbackUrl: checkCallbackUrl(setup, run.id),
  }));
  if (!sent.ok) {
    await db
      .update(drawingCheckRuns)
      .set({ status: "failed", errorCode: sent.code, error: sent.error, finishedAt: new Date() })
      .where(and(eq(drawingCheckRuns.id, run.id), eq(drawingCheckRuns.status, "queued")));
    await deleteCheckFiles([run.objectKey]);
  }

  await audit({
    kind: "drawing.check.requested",
    refType: "drawing",
    refId: rev.drawingId,
    summary: sent.ok
      ? `${rev.code} ${rev.label} DXF check requested — ${run.originalName} (${formatFileSize(stored.size)})`
      : `${rev.code} ${rev.label} DXF check couldn't start — ${sent.error}`,
    payload: {
      projectId: rev.projectId,
      revisionId: rev.id,
      runId: run.id,
      originalName: run.originalName,
      sizeBytes: stored.size,
      configVersion: snapshot.version,
      ...(sent.ok ? {} : { errorCode: sent.code }),
    },
  });
  revalidateDrawingViews(rev.drawingId, rev.projectId);
  return sent.ok ? { ok: true } : fail(sent.error);
}

/** The browser couldn't finish the upload — forget it now instead of waiting for the cleanup. */
export async function cancelDrawingCheckUpload(input: { runId: string }): Promise<DrawingActionResult> {
  const runId = Id.parse(input.runId);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const gone = await db
    .delete(drawingCheckRuns)
    .where(and(
      eq(drawingCheckRuns.id, runId),
      eq(drawingCheckRuns.status, "pending"),
      eq(drawingCheckRuns.uploadedById, session.user.id),
    ))
    .returning({ objectKey: drawingCheckRuns.objectKey });
  await deleteCheckFiles(gone.map(r => r.objectKey));
  return { ok: true };
}
