"use server";

import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { bomRevisionDrawings, bomRevisions, boms, drawingRevisions, drawings } from "@/db/schema";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { READ_ONLY_ERROR, canEdit } from "@/lib/roles";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { isRevisionImmutable } from "../lib/revision-status";
import type { DrawingActionResult } from "./drawings";

const fail = (error: string) => ({ ok: false as const, error });

async function loadBomRevision(bomRevisionId: string) {
  const [row] = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      bomId: boms.id,
      bomName: boms.name,
      projectId: boms.projectId,
    })
    .from(bomRevisions)
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .where(and(eq(bomRevisions.id, bomRevisionId), isNull(boms.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Latest revision id per drawing. */
async function latestRevisionIds(drawingIds: string[]) {
  if (drawingIds.length === 0) return new Map<string, { id: string; number: number }>();
  const rows = await db
    .selectDistinctOn([drawingRevisions.drawingId], {
      drawingId: drawingRevisions.drawingId,
      id: drawingRevisions.id,
      number: drawingRevisions.number,
    })
    .from(drawingRevisions)
    .where(inArray(drawingRevisions.drawingId, drawingIds))
    .orderBy(drawingRevisions.drawingId, desc(drawingRevisions.number));
  return new Map(rows.map(r => [r.drawingId, { id: r.id, number: r.number }]));
}

function revalidateLinks(rev: { projectId: string; bomId: string }, drawingIds: string[]) {
  revalidatePath(`/builder/${rev.projectId}/${rev.bomId}`);
  revalidatePath(`/preview/${rev.projectId}/${rev.bomId}`);
  revalidatePath("/dashboard");
  for (const id of drawingIds) revalidatePath(`/drawings/${id}`);
}

const LinkInput = z.object({
  bomRevisionId: z.string().min(1),
  drawingIds: z.array(z.string().min(1)).min(1).max(200),
});

/** References each drawing at its latest revision. Only draft BOM revisions can change. */
export async function linkDrawingsToBom(input: z.infer<typeof LinkInput>): Promise<DrawingActionResult<{ added: number }>> {
  const data = LinkInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const rev = await loadBomRevision(data.bomRevisionId);
  if (!rev) return fail("BOM revision not found.");
  if (isRevisionImmutable(rev.status)) return fail("Committed revisions are read-only — branch a new revision to change drawings.");

  const ids = [...new Set(data.drawingIds)];
  const found = await db
    .select({ id: drawings.id, code: drawings.code })
    .from(drawings)
    .where(and(inArray(drawings.id, ids), eq(drawings.projectId, rev.projectId), isNull(drawings.deletedAt)));
  if (found.length !== ids.length) return fail("Only drawings of the same project can be linked.");

  const latest = await latestRevisionIds(ids);
  const added = await db
    .insert(bomRevisionDrawings)
    .values(found.map(d => ({
      bomRevisionId: rev.id,
      drawingId: d.id,
      drawingRevisionId: latest.get(d.id)!.id,
      createdById: session.user.id,
    })))
    .onConflictDoNothing()
    .returning({ drawingId: bomRevisionDrawings.drawingId });

  revalidateLinks(rev, ids);
  if (added.length) {
    const codes = found.filter(d => added.some(a => a.drawingId === d.id)).map(d => d.code);
    await audit({
      kind: "bom.drawing.linked",
      refType: "bom",
      refId: rev.bomId,
      summary: `Rev ${rev.letter} of "${rev.bomName}" now references ${codes.join(", ")}`,
      payload: { projectId: rev.projectId, bomRevisionId: rev.id, drawingIds: added.map(a => a.drawingId) },
    });
  }
  return { ok: true, added: added.length };
}

async function loadLink(linkId: string) {
  const [link] = await db
    .select({
      id: bomRevisionDrawings.id,
      bomRevisionId: bomRevisionDrawings.bomRevisionId,
      drawingId: bomRevisionDrawings.drawingId,
      code: drawings.code,
    })
    .from(bomRevisionDrawings)
    .innerJoin(drawings, eq(drawings.id, bomRevisionDrawings.drawingId))
    .where(eq(bomRevisionDrawings.id, linkId))
    .limit(1);
  return link ?? null;
}

export async function unlinkDrawingFromBom(input: { linkId: string }): Promise<DrawingActionResult> {
  const linkId = z.string().min(1).parse(input.linkId);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const link = await loadLink(linkId);
  if (!link) return fail("Link not found.");
  const rev = await loadBomRevision(link.bomRevisionId);
  if (!rev) return fail("BOM revision not found.");
  if (isRevisionImmutable(rev.status)) return fail("Committed revisions are read-only.");

  await db.delete(bomRevisionDrawings).where(eq(bomRevisionDrawings.id, linkId));

  revalidateLinks(rev, [link.drawingId]);
  await audit({
    kind: "bom.drawing.unlinked",
    refType: "bom",
    refId: rev.bomId,
    summary: `${link.code} removed from Rev ${rev.letter} of "${rev.bomName}"`,
    payload: { projectId: rev.projectId, bomRevisionId: rev.id, drawingId: link.drawingId },
  });
  return { ok: true };
}

const UpdateInput = z.object({
  bomRevisionId: z.string().min(1),
  /** Omit to bring every outdated reference up to date. */
  linkIds: z.array(z.string().min(1)).max(200).optional(),
});

/** Moves references to each drawing's latest revision. */
export async function updateBomDrawingLinks(input: z.infer<typeof UpdateInput>): Promise<DrawingActionResult<{ updated: number }>> {
  const data = UpdateInput.parse(input);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const rev = await loadBomRevision(data.bomRevisionId);
  if (!rev) return fail("BOM revision not found.");
  if (isRevisionImmutable(rev.status)) return fail("Committed revisions are read-only — branch a new revision to update drawings.");

  const links = await db
    .select({
      id: bomRevisionDrawings.id,
      drawingId: bomRevisionDrawings.drawingId,
      drawingRevisionId: bomRevisionDrawings.drawingRevisionId,
      code: drawings.code,
    })
    .from(bomRevisionDrawings)
    .innerJoin(drawings, eq(drawings.id, bomRevisionDrawings.drawingId))
    .where(and(
      eq(bomRevisionDrawings.bomRevisionId, rev.id),
      data.linkIds ? inArray(bomRevisionDrawings.id, data.linkIds) : undefined,
    ));
  const latest = await latestRevisionIds(links.map(l => l.drawingId));
  const stale = links.filter(l => latest.get(l.drawingId) && latest.get(l.drawingId)!.id !== l.drawingRevisionId);
  if (stale.length === 0) return { ok: true, updated: 0 };

  await db.transaction(async tx => {
    for (const l of stale) {
      await tx
        .update(bomRevisionDrawings)
        .set({ drawingRevisionId: latest.get(l.drawingId)!.id })
        .where(eq(bomRevisionDrawings.id, l.id));
    }
  });

  revalidateLinks(rev, stale.map(l => l.drawingId));
  await audit({
    kind: "bom.drawing.updated",
    refType: "bom",
    refId: rev.bomId,
    summary: `Rev ${rev.letter} of "${rev.bomName}" updated to ${stale
      .map(l => `${l.code} ${formatDrawingRevision(latest.get(l.drawingId)!.number)}`)
      .join(", ")}`,
    payload: { projectId: rev.projectId, bomRevisionId: rev.id, linkIds: stale.map(l => l.id) },
  });
  return { ok: true, updated: stale.length };
}
