import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingFiles, drawingRevisions, drawings, projects } from "@/db/schema";
import { DRAWING_FILE_TYPE, drawingFileName, isFileStatus } from "@/lib/drawing-files";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { canEdit } from "@/lib/roles";
import { presignDownload } from "@/lib/s3";
import { requireSession } from "@/server/auth-context";
import { audit } from "@/server/audit";
import { loadDrawingFileGate } from "@/server/lib/drawing-file-gate";

/**
 * Opens a drawing PDF (`?download=1` saves it instead): checks who is asking,
 * then sends the browser to a short-lived bucket link, so the file never
 * passes through the app.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [file] = await db
    .select({
      objectKey: drawingFiles.objectKey,
      archivedAt: drawingFiles.archivedAt,
      revisionId: drawingRevisions.id,
      revisionNumber: drawingRevisions.number,
      status: drawingRevisions.status,
      drawingId: drawings.id,
      code: drawings.code,
      projectId: drawings.projectId,
    })
    .from(drawingFiles)
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingFiles.revisionId))
    .innerJoin(drawings, eq(drawings.id, drawingFiles.drawingId))
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .where(and(
      eq(drawingFiles.id, id),
      eq(drawingFiles.status, "ready"),
      isNull(drawings.deletedAt),
      isNull(projects.deletedAt),
    ))
    .limit(1);
  if (!file) return new NextResponse("Not found", { status: 404 });

  let session;
  try {
    session = await requireSession();
  } catch {
    // Links in emails land here signed out: sign in, then open the drawing page.
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("next", `/drawings/${file.drawingId}`);
    return NextResponse.redirect(signIn);
  }

  // Viewers get the current PDF of revisions that passed the upload rule — never one in the works.
  if (!canEdit(session.user) && (file.archivedAt || !isFileStatus(file.status, await loadDrawingFileGate()))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  const url = await presignDownload(file.objectKey, 60 * 5, {
    fileName: drawingFileName(file.code, file.revisionNumber),
    contentType: DRAWING_FILE_TYPE,
    disposition,
  });
  await audit({
    kind: "drawing.file.downloaded",
    refType: "drawing",
    refId: file.drawingId,
    summary: `${file.code} ${formatDrawingRevision(file.revisionNumber)} PDF ${disposition === "inline" ? "opened" : "downloaded"}`,
    payload: { projectId: file.projectId, revisionId: file.revisionId, fileId: id },
  });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
