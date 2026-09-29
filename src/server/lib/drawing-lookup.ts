import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { drawingRevisions, drawings } from "@/db/schema";

/** A revision of a live (not archived) drawing, plus whether it is the latest one. */
export async function findDrawingRevision(revisionId: string) {
  const [rev] = await db
    .select({
      id: drawingRevisions.id,
      number: drawingRevisions.number,
      status: drawingRevisions.status,
      drawingId: drawings.id,
      code: drawings.code,
      name: drawings.name,
      projectId: drawings.projectId,
      ownerId: drawings.ownerId,
    })
    .from(drawingRevisions)
    .innerJoin(drawings, eq(drawings.id, drawingRevisions.drawingId))
    .where(and(eq(drawingRevisions.id, revisionId), isNull(drawings.deletedAt)))
    .limit(1);
  if (!rev) return null;
  const latest = await findLatestRevision(rev.drawingId);
  return { ...rev, isLatest: latest?.id === rev.id };
}

export async function findLatestRevision(drawingId: string) {
  const [rev] = await db
    .select({ id: drawingRevisions.id, number: drawingRevisions.number, status: drawingRevisions.status })
    .from(drawingRevisions)
    .where(eq(drawingRevisions.drawingId, drawingId))
    .orderBy(desc(drawingRevisions.number))
    .limit(1);
  return rev ?? null;
}

/** Everything that renders drawing hours, remarks or transmittals. */
export function revalidateDrawingViews(drawingId: string, projectId: string) {
  revalidatePath("/drawings");
  revalidatePath("/dashboard");
  revalidatePath(`/drawings/${drawingId}`);
  revalidatePath(`/projects/${projectId}`);
}
