import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingFiles, user } from "@/db/schema";
import { requireSession } from "../auth-context";
import { loadDrawingFileGate } from "../lib/drawing-file-gate";

/** The current PDF of each revision of a drawing; replaced and removed ones are left out. */
export async function listDrawingFiles(drawingId: string) {
  await requireSession();
  return db
    .select({
      id: drawingFiles.id,
      revisionId: drawingFiles.revisionId,
      originalName: drawingFiles.originalName,
      sizeBytes: drawingFiles.sizeBytes,
      uploadedAt: drawingFiles.uploadedAt,
      uploadedByName: user.name,
    })
    .from(drawingFiles)
    .leftJoin(user, eq(user.id, drawingFiles.uploadedById))
    .where(and(
      eq(drawingFiles.drawingId, drawingId),
      eq(drawingFiles.status, "ready"),
      isNull(drawingFiles.archivedAt),
    ));
}

export type DrawingFileRow = Awaited<ReturnType<typeof listDrawingFiles>>[number];

export async function getDrawingFileGate() {
  await requireSession();
  return loadDrawingFileGate();
}
