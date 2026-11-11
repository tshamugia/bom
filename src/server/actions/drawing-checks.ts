"use server";

import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingCheckRuns, drawingEvents, drawings } from "@/db/schema";
import {
  CHECK_DOWNLOAD_TTL_S, CHECK_UPLOAD_BLOCK_MESSAGE, CHECK_UPLOAD_EXPIRES_S, DXF_CONTENT_TYPE, DXF_FILE_ERROR_MESSAGE,
  MAX_DXF_BYTES, checkConfigSnapshot, checkDxfFile, checkFileRole, checkRequestBody, checkUploadBlock, storedDxfError,
} from "@/lib/drawing-checks";
import { formatFileSize } from "@/lib/drawing-files";
import { isProjectCode } from "@/lib/codes";
import { checkFileLink, oldProjectCodeReason, sheetCodeTakenMessage } from "@/lib/drawing-check-link";
import { READ_ONLY_ERROR, canEdit } from "@/lib/roles";
import { headObject, presignDownload, presignUpload, readObjectStart } from "@/lib/s3";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { isUniqueViolation } from "../lib/db-errors";
import {
  activeCheckRevisionIds, closeStaleCheckRuns, deleteCheckFiles, loadCheckExceptions, loadDrawingCheckConfig,
  loadDrawingCheckEnabled,
} from "../lib/drawing-check-config";
import { findDrawingRevision, findLatestRevision, revalidateDrawingViews } from "../lib/drawing-lookup";
import { sheetCodeOwner } from "../lib/drawing-sheet-codes";
import { checkCallbackUrl, dxfCheckerSetup, submitCheck } from "../lib/dxf-checker";
import type { DrawingActionResult } from "./drawings";

const fail = (error: string) => ({ ok: false as const, error });

const Id = z.string().min(1);

const EXPIRED = "This upload has expired — upload the DXF again.";

/** The run moved on, or someone else linked the drawing, between the checks and the write. */
class UploadRace extends Error {}

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

const FileInput = z.object({
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().nonnegative(),
});

const RequestInput = FileInput.extend({ revisionId: Id });

type UploadForm = DrawingActionResult<{ runId: string; url: string; fields: Record<string, string> }>;

/**
 * Whether this file may go to this drawing (`checkFileLink`): a standard name
 * must carry the drawing's project code and, once the drawing has a sheet
 * code, exactly that code. Returns the sheet code the upload links, if any.
 */
async function fileLinkProblem(rev: Revision, fileName: string): Promise<{ error: string } | { link: string | null }> {
  const link = checkFileLink({ fileName, projectCode: rev.projectCode, sheetCode: rev.sheetCode });
  if (!link.ok) return { error: link.message };
  if (link.link) {
    const owner = await sheetCodeOwner(db, rev.projectId, link.link, rev.drawingId);
    if (owner) return { error: sheetCodeTakenMessage(link.link, owner) };
  }
  return { link: link.link };
}

/**
 * Step 1 of a check: any editor, on the drawing's latest revision, while
 * checks are on. Hands back a form the browser posts the DXF to, straight
 * into the bucket, capped at `MAX_DXF_MB`.
 */
export async function requestDrawingCheckUpload(input: z.infer<typeof RequestInput>): Promise<UploadForm> {
  const data = RequestInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const file = checkDxfFile({ name: data.fileName, size: data.size });
  if (!file.ok) return fail(DXF_FILE_ERROR_MESSAGE[file.error]);

  const rev = await findDrawingRevision(data.revisionId);
  if (!rev) return fail("Revision not found.");
  return openCheckRun(session.user.id, rev, data);
}

const BulkRequestInput = FileInput.extend({ drawingId: Id });

/**
 * Step 1 for one file of a bulk upload from /drawings (`planBulkDrawingChecks`
 * matched it to the drawing): the drawing's latest revision, the same rules as
 * a single upload, and no project with an old-style code.
 */
export async function requestBulkDrawingCheckUpload(input: z.infer<typeof BulkRequestInput>): Promise<UploadForm> {
  const data = BulkRequestInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const file = checkDxfFile({ name: data.fileName, size: data.size });
  if (!file.ok) return fail(DXF_FILE_ERROR_MESSAGE[file.error]);

  const latest = await findLatestRevision(data.drawingId);
  const rev = latest ? await findDrawingRevision(latest.id) : null;
  if (!rev) return fail("Drawing not found.");
  if (!isProjectCode(rev.projectCode)) return fail(oldProjectCodeReason(rev.projectCode));
  return openCheckRun(session.user.id, rev, data);
}

async function openCheckRun(userId: string, rev: Revision, data: z.infer<typeof FileInput>): Promise<UploadForm> {
  const linked = await fileLinkProblem(rev, data.fileName);
  if ("error" in linked) return fail(linked.error);
  await closeStaleCheckRuns();
  // Starting over drops the same person's unfinished upload on this revision (a closed tab, a lost connection).
  const own = await db
    .delete(drawingCheckRuns)
    .where(and(
      eq(drawingCheckRuns.revisionId, rev.id),
      eq(drawingCheckRuns.status, "pending"),
      eq(drawingCheckRuns.uploadedById, userId),
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
      uploadedById: userId,
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

const ConfirmInput = z.object({
  runId: Id,
  /** Bulk uploads: a full checker queue puts the run back to wait instead of failing it. */
  retryWhenBusy: z.boolean().optional(),
});

/** `busy`: the checker's queue is full; the run waits and the browser tries again (`CHECKER_BUSY_RETRY_MS`). */
export type ConfirmCheckResult = { ok: true } | { ok: false; error: string; busy?: true };

/**
 * Step 2: checks what reached the bucket really is a DXF (a renamed DWG is
 * sent back with how to save a DXF) and that it still belongs to the drawing,
 * links the drawing's sheet code on a first upload, then hands the file to
 * the checker. The findings arrive later at
 * /api/internal/drawing-checks/[id]/result.
 */
export async function confirmDrawingCheckUpload(input: z.input<typeof ConfirmInput>): Promise<ConfirmCheckResult> {
  const { runId, retryWhenBusy } = ConfirmInput.parse(input);
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
  // The drawing's sheet code may have been set or changed while the file was uploading.
  const linked = await fileLinkProblem(rev, run.originalName);
  if ("error" in linked) return discard(linked.error);

  // Only what runs on this drawing: rules on in Settings, minus its project's client naming and its false errors.
  const [config, exceptions] = await Promise.all([loadDrawingCheckConfig(), loadCheckExceptions(rev.drawingId)]);
  const snapshot = checkConfigSnapshot(config, exceptions);
  const now = new Date();
  try {
    // Queued before the checker hears of it, so even an instant callback finds the run waiting.
    await db.transaction(async tx => {
      if (linked.link) {
        // The first file linked to the drawing by hand gives it its sheet code.
        const [set] = await tx
          .update(drawings)
          .set({ sheetCode: linked.link, lastModifiedById: session.user.id, updatedAt: now })
          .where(and(eq(drawings.id, rev.drawingId), isNull(drawings.sheetCode)))
          .returning({ id: drawings.id });
        if (!set) throw new UploadRace();
        await tx.insert(drawingEvents).values({
          drawingId: rev.drawingId,
          revisionId: rev.id,
          kind: "updated",
          body: `Sheet code: — → ${linked.link} (from ${run.originalName})`,
          actorId: session.user.id,
        });
      }
      const [row] = await tx
        .update(drawingCheckRuns)
        .set({
          status: "queued",
          sizeBytes: stored.size,
          configVersion: snapshot.version,
          configSnapshot: snapshot,
          startedAt: now,
          ...(linked.link ? { linkedSheetCode: linked.link } : {}),
        })
        .where(and(eq(drawingCheckRuns.id, run.id), eq(drawingCheckRuns.status, "pending")))
        .returning({ id: drawingCheckRuns.id });
      if (!row) throw new UploadRace();
    });
  } catch (e) {
    if (e instanceof UploadRace) return fail(EXPIRED);
    if (isUniqueViolation(e) && linked.link) {
      const owner = await sheetCodeOwner(db, rev.projectId, linked.link, rev.drawingId);
      return discard(sheetCodeTakenMessage(linked.link, owner ?? "another drawing"));
    }
    throw e;
  }
  if (linked.link) {
    await audit({
      kind: "drawing.updated",
      refType: "drawing",
      refId: rev.drawingId,
      summary: `${rev.code} updated — sheet code`,
      payload: { projectId: rev.projectId, changes: [`Sheet code: — → ${linked.link}`], fromFile: run.originalName },
    });
  }

  const sent = await submitCheck(setup, checkRequestBody({
    runId: run.id,
    fileUrl: await presignDownload(run.objectKey, CHECK_DOWNLOAD_TTL_S),
    fileName: run.originalName,
    sizeBytes: stored.size,
    role: checkFileRole(rev.status),
    config: snapshot,
    callbackUrl: checkCallbackUrl(setup, run.id),
  }));
  if (!sent.ok && sent.code === "BUSY" && retryWhenBusy) {
    // The file stays in the bucket and the run waits; the browser asks again in a while.
    await db
      .update(drawingCheckRuns)
      .set({ status: "pending", startedAt: null })
      .where(and(eq(drawingCheckRuns.id, run.id), eq(drawingCheckRuns.status, "queued")));
    return { ok: false, error: sent.error, busy: true };
  }
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
