"use server";

import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingEvents, drawingFiles, drawingRevisions, drawings, projects } from "@/db/schema";
import {
  DRAWING_FILE_TYPE,
  FILE_TYPE_ERROR_MESSAGE,
  MAX_DRAWING_FILE_BYTES,
  checkFileType,
  checkFileUpload,
  drawingFileKey,
  fileUploadErrorMessage,
  formatFileSize,
  looksLikePdf,
} from "@/lib/drawing-files";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { ADMIN_ONLY_ERROR, READ_ONLY_ERROR, canEdit, isAdmin } from "@/lib/roles";
import { deleteObject, headObject, presignUpload, readObjectStart } from "@/lib/s3";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { isUniqueViolation } from "../lib/db-errors";
import { loadDrawingFileGate } from "../lib/drawing-file-gate";
import { findLatestRevision, revalidateDrawingViews } from "../lib/drawing-lookup";
import type { DrawingActionResult } from "./drawings";

const fail = (error: string) => ({ ok: false as const, error });

const Id = z.string().min(1);

/** Upload forms expire after 10 minutes; a pending row this old was abandoned. */
const ABANDONED_AFTER_MS = 60 * 60 * 1000;

/** A revision of a live drawing in a live project, with what the upload rules need. */
async function findRevision(revisionId: string) {
  const [rev] = await db
    .select({
      id: drawingRevisions.id,
      number: drawingRevisions.number,
      status: drawingRevisions.status,
      drawingId: drawings.id,
      code: drawings.code,
      ownerId: drawings.ownerId,
      projectId: projects.id,
      projectCode: projects.code,
    })
    .from(drawingRevisions)
    .innerJoin(drawings, eq(drawings.id, drawingRevisions.drawingId))
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .where(and(eq(drawingRevisions.id, revisionId), isNull(drawings.deletedAt), isNull(projects.deletedAt)))
    .limit(1);
  if (!rev) return null;
  const latest = await findLatestRevision(rev.drawingId);
  return { ...rev, isLatest: latest?.id === rev.id };
}

type Revision = NonNullable<Awaited<ReturnType<typeof findRevision>>>;

async function checkRules(rev: Revision, user: { id: string; role?: unknown }) {
  const gate = await loadDrawingFileGate();
  const check = checkFileUpload({
    status: rev.status,
    gate,
    isLatest: rev.isLatest,
    actorId: user.id,
    actorIsAdmin: isAdmin(user),
    ownerId: rev.ownerId,
  });
  return check.ok ? null : fileUploadErrorMessage(check.error, gate);
}

/** Drops an unfinished upload: the pending row and whatever reached the bucket. */
async function discardUpload(file: { id: string; objectKey: string }) {
  await db.delete(drawingFiles).where(and(eq(drawingFiles.id, file.id), eq(drawingFiles.status, "pending")));
  await deleteObject(file.objectKey).catch(e => console.error("[drawing-files] couldn't delete", file.objectKey, e));
}

async function dropAbandonedUploads() {
  const stale = await db
    .delete(drawingFiles)
    .where(and(eq(drawingFiles.status, "pending"), lt(drawingFiles.createdAt, new Date(Date.now() - ABANDONED_AFTER_MS))))
    .returning({ objectKey: drawingFiles.objectKey });
  await Promise.allSettled(stale.map(f => deleteObject(f.objectKey)));
}

const RequestInput = z.object({
  revisionId: Id,
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().max(200),
  size: z.number().int().nonnegative(),
});

/**
 * Step 1 of an upload: checks the rules and hands back a form the browser
 * posts the PDF to, straight into the bucket.
 */
export async function requestDrawingFileUpload(
  input: z.infer<typeof RequestInput>,
): Promise<DrawingActionResult<{ fileId: string; url: string; fields: Record<string, string> }>> {
  const data = RequestInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const type = checkFileType({ name: data.fileName, type: data.contentType, size: data.size });
  if (!type.ok) return fail(FILE_TYPE_ERROR_MESSAGE[type.error]);

  const rev = await findRevision(data.revisionId);
  if (!rev) return fail("Revision not found.");
  const blocked = await checkRules(rev, session.user);
  if (blocked) return fail(blocked);

  await dropAbandonedUploads();
  const fileId = createId();
  const objectKey = drawingFileKey({
    projectCode: rev.projectCode,
    drawingCode: rev.code,
    revisionNumber: rev.number,
    fileId,
  });
  await db.insert(drawingFiles).values({
    id: fileId,
    drawingId: rev.drawingId,
    revisionId: rev.id,
    objectKey,
    originalName: data.fileName,
    contentType: DRAWING_FILE_TYPE,
    sizeBytes: data.size,
    uploadedById: session.user.id,
  });
  const { url, fields } = await presignUpload(objectKey, { contentType: DRAWING_FILE_TYPE, maxBytes: MAX_DRAWING_FILE_BYTES });
  return { ok: true, fileId, url, fields };
}

class UploadGone extends Error {}

/**
 * Step 2: checks what reached the bucket really is a PDF, then makes it the
 * revision's PDF. A PDF already there is archived, not deleted.
 */
export async function confirmDrawingFileUpload(input: { fileId: string }): Promise<DrawingActionResult> {
  const fileId = Id.parse(input.fileId);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const [file] = await db
    .select({
      id: drawingFiles.id,
      revisionId: drawingFiles.revisionId,
      objectKey: drawingFiles.objectKey,
      originalName: drawingFiles.originalName,
      status: drawingFiles.status,
      uploadedById: drawingFiles.uploadedById,
    })
    .from(drawingFiles)
    .where(eq(drawingFiles.id, fileId))
    .limit(1);
  if (!file || file.status !== "pending" || file.uploadedById !== session.user.id) {
    return fail("This upload has expired — upload the PDF again.");
  }
  const discard = async (error: string) => {
    await discardUpload(file);
    return fail(error);
  };

  // The status or the owner may have changed while the file was uploading.
  const rev = await findRevision(file.revisionId);
  if (!rev) return discard("Revision not found.");
  const blocked = await checkRules(rev, session.user);
  if (blocked) return discard(blocked);

  const stored = await headObject(file.objectKey);
  if (!stored) return discard("The file didn't reach the storage — upload it again.");
  if (stored.size > MAX_DRAWING_FILE_BYTES) return discard(FILE_TYPE_ERROR_MESSAGE.TOO_LARGE);
  const start = await readObjectStart(file.objectKey);
  if (!start || !looksLikePdf(start)) return discard("This file isn't a PDF.");

  const now = new Date();
  let replaced: { id: string; originalName: string } | undefined;
  try {
    replaced = await db.transaction(async tx => {
      const [old] = await tx
        .update(drawingFiles)
        .set({ archivedAt: now, archivedById: session.user.id, archiveReason: "Replaced" })
        .where(and(eq(drawingFiles.revisionId, rev.id), eq(drawingFiles.status, "ready"), isNull(drawingFiles.archivedAt)))
        .returning({ id: drawingFiles.id, originalName: drawingFiles.originalName });
      const [done] = await tx
        .update(drawingFiles)
        .set({ status: "ready", sizeBytes: stored.size, uploadedAt: now })
        .where(and(eq(drawingFiles.id, file.id), eq(drawingFiles.status, "pending")))
        .returning({ id: drawingFiles.id });
      if (!done) throw new UploadGone();
      const size = formatFileSize(stored.size);
      await tx.insert(drawingEvents).values({
        drawingId: rev.drawingId,
        revisionId: rev.id,
        kind: "file",
        body: old
          ? `Replaced ${old.originalName} with ${file.originalName} (${size})`
          : `Uploaded ${file.originalName} (${size})`,
        actorId: session.user.id,
      });
      await tx.update(drawings)
        .set({ lastModifiedById: session.user.id, updatedAt: now })
        .where(eq(drawings.id, rev.drawingId));
      return old;
    });
  } catch (e) {
    if (e instanceof UploadGone) return fail("This upload has expired — upload the PDF again.");
    if (isUniqueViolation(e)) return discard("Someone else just uploaded a PDF to this revision — refresh the page.");
    throw e;
  }

  revalidateDrawingViews(rev.drawingId, rev.projectId);
  await audit({
    kind: "drawing.file.uploaded",
    refType: "drawing",
    refId: rev.drawingId,
    summary: `${rev.code} ${formatDrawingRevision(rev.number)} PDF ${replaced ? "replaced" : "uploaded"}`,
    payload: {
      projectId: rev.projectId,
      revisionId: rev.id,
      fileId: file.id,
      originalName: file.originalName,
      sizeBytes: stored.size,
      replacedFileId: replaced?.id ?? null,
    },
  });
  return { ok: true };
}

/** The browser couldn't finish the upload — forget it now instead of waiting for the cleanup. */
export async function cancelDrawingFileUpload(input: { fileId: string }): Promise<DrawingActionResult> {
  const fileId = Id.parse(input.fileId);
  const session = await requireSession();
  const [file] = await db
    .select({ id: drawingFiles.id, objectKey: drawingFiles.objectKey })
    .from(drawingFiles)
    .where(and(
      eq(drawingFiles.id, fileId),
      eq(drawingFiles.status, "pending"),
      eq(drawingFiles.uploadedById, session.user.id),
    ))
    .limit(1);
  if (file) await discardUpload(file);
  return { ok: true };
}

const RemoveInput = z.object({
  fileId: Id,
  reason: z.string().trim().min(1).max(500),
});

/** Takes a PDF off its revision. Admins only; the object stays in the bucket. */
export async function removeDrawingFile(input: z.infer<typeof RemoveInput>): Promise<DrawingActionResult> {
  const { fileId, reason } = RemoveInput.parse(input);
  const session = await requireSession();
  if (!isAdmin(session.user)) return fail(ADMIN_ONLY_ERROR);

  const [file] = await db
    .select({
      id: drawingFiles.id,
      revisionId: drawingFiles.revisionId,
      originalName: drawingFiles.originalName,
      number: drawingRevisions.number,
      drawingId: drawings.id,
      code: drawings.code,
      projectId: drawings.projectId,
    })
    .from(drawingFiles)
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingFiles.revisionId))
    .innerJoin(drawings, eq(drawings.id, drawingFiles.drawingId))
    .where(and(
      eq(drawingFiles.id, fileId),
      eq(drawingFiles.status, "ready"),
      isNull(drawingFiles.archivedAt),
      isNull(drawings.deletedAt),
    ))
    .limit(1);
  if (!file) return fail("PDF not found.");

  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(drawingFiles)
      .set({ archivedAt: now, archivedById: session.user.id, archiveReason: reason })
      .where(eq(drawingFiles.id, file.id));
    await tx.insert(drawingEvents).values({
      drawingId: file.drawingId,
      revisionId: file.revisionId,
      kind: "file",
      body: `Removed ${file.originalName} — ${reason}`,
      actorId: session.user.id,
    });
    await tx.update(drawings)
      .set({ lastModifiedById: session.user.id, updatedAt: now })
      .where(eq(drawings.id, file.drawingId));
  });

  revalidateDrawingViews(file.drawingId, file.projectId);
  await audit({
    kind: "drawing.file.removed",
    refType: "drawing",
    refId: file.drawingId,
    summary: `${file.code} ${formatDrawingRevision(file.number)} PDF removed — ${reason}`,
    payload: { projectId: file.projectId, revisionId: file.revisionId, fileId: file.id, reason },
  });
  return { ok: true };
}
