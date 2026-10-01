import "server-only";
import { aliasedTable, and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  bomRevisionDrawings,
  bomRevisions,
  boms,
  drawingDisciplines,
  drawingRemarks,
  drawingRevisions,
  drawingTimeEntries,
  drawingTransmittals,
  drawings,
  user,
} from "@/db/schema";
import { requireSession } from "../auth-context";
import { bomImpactRevisions, isOutdatedSql } from "../lib/bom-drawing-outdated";

/** Latest revision per drawing — the one that can still move. */
function latestRevisions() {
  return db
    .selectDistinctOn([drawingRevisions.drawingId], {
      drawingId: drawingRevisions.drawingId,
      revisionId: drawingRevisions.id,
      number: drawingRevisions.number,
      status: drawingRevisions.status,
    })
    .from(drawingRevisions)
    .orderBy(drawingRevisions.drawingId, desc(drawingRevisions.number))
    .as("latest");
}

export async function listTimeEntries(drawingId: string) {
  await requireSession();
  return db
    .select({
      id: drawingTimeEntries.id,
      revisionId: drawingTimeEntries.revisionId,
      revisionNumber: drawingRevisions.number,
      userId: drawingTimeEntries.userId,
      userName: user.name,
      hours: drawingTimeEntries.hours,
      workDate: drawingTimeEntries.workDate,
      note: drawingTimeEntries.note,
      createdAt: drawingTimeEntries.createdAt,
    })
    .from(drawingTimeEntries)
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingTimeEntries.revisionId))
    .leftJoin(user, eq(user.id, drawingTimeEntries.userId))
    .where(eq(drawingTimeEntries.drawingId, drawingId))
    .orderBy(desc(drawingTimeEntries.workDate), desc(drawingTimeEntries.createdAt));
}

export type TimeEntryRow = Awaited<ReturnType<typeof listTimeEntries>>[number];

export async function listRemarks(drawingId: string) {
  await requireSession();
  // `alias` (not `aliasedTable`) keeps the names apart at the type level; an
  // inner and a left join of the same table otherwise collapse the row to `never`.
  const raisedIn = alias(drawingRevisions, "raised_in");
  const resolvedIn = alias(drawingRevisions, "resolved_in");
  const raisedBy = aliasedTable(user, "raised_by");
  const resolvedBy = aliasedTable(user, "resolved_by");
  return db
    .select({
      id: drawingRemarks.id,
      revisionId: drawingRemarks.revisionId,
      revisionNumber: raisedIn.number,
      source: drawingRemarks.source,
      body: drawingRemarks.body,
      raisedByName: raisedBy.name,
      createdAt: drawingRemarks.createdAt,
      resolvedAt: drawingRemarks.resolvedAt,
      resolvedByName: resolvedBy.name,
      resolvedInRevisionNumber: resolvedIn.number,
      resolution: drawingRemarks.resolution,
    })
    .from(drawingRemarks)
    .innerJoin(raisedIn, eq(raisedIn.id, drawingRemarks.revisionId))
    .leftJoin(resolvedIn, eq(resolvedIn.id, drawingRemarks.resolvedInRevisionId))
    .leftJoin(raisedBy, eq(raisedBy.id, drawingRemarks.raisedById))
    .leftJoin(resolvedBy, eq(resolvedBy.id, drawingRemarks.resolvedById))
    .where(eq(drawingRemarks.drawingId, drawingId))
    .orderBy(sql`${drawingRemarks.resolvedAt} IS NOT NULL`, desc(drawingRemarks.createdAt));
}

export type RemarkRow = Awaited<ReturnType<typeof listRemarks>>[number];

export async function listTransmittals(drawingId: string) {
  await requireSession();
  const recipient = aliasedTable(user, "recipient");
  const sender = aliasedTable(user, "sender");
  return db
    .select({
      id: drawingTransmittals.id,
      revisionId: drawingTransmittals.revisionId,
      revisionNumber: drawingRevisions.number,
      purpose: drawingTransmittals.purpose,
      recipientUserId: drawingTransmittals.recipientUserId,
      recipientName: recipient.name,
      externalName: drawingTransmittals.externalName,
      note: drawingTransmittals.note,
      sentByName: sender.name,
      createdAt: drawingTransmittals.createdAt,
      acknowledgedAt: drawingTransmittals.acknowledgedAt,
    })
    .from(drawingTransmittals)
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingTransmittals.revisionId))
    .leftJoin(recipient, eq(recipient.id, drawingTransmittals.recipientUserId))
    .leftJoin(sender, eq(sender.id, drawingTransmittals.sentById))
    .where(eq(drawingTransmittals.drawingId, drawingId))
    .orderBy(desc(drawingTransmittals.createdAt));
}

export type TransmittalRow = Awaited<ReturnType<typeof listTransmittals>>[number];

/** BOM revisions that reference this drawing, newest BOM revision first. */
export async function listBomLinksForDrawing(drawingId: string) {
  await requireSession();
  const current = db
    .selectDistinctOn([bomRevisions.bomId], { bomId: bomRevisions.bomId, revisionId: bomRevisions.id })
    .from(bomRevisions)
    .orderBy(bomRevisions.bomId, desc(bomRevisions.createdAt))
    .as("current_rev");
  const checked = alias(drawingRevisions, "checked_rev");
  const impact = bomImpactRevisions();
  return db
    .select({
      linkId: bomRevisionDrawings.id,
      bomId: boms.id,
      bomName: boms.name,
      projectId: boms.projectId,
      bomRevisionId: bomRevisions.id,
      bomRevisionLetter: bomRevisions.letter,
      bomRevisionStatus: bomRevisions.status,
      isCurrentBomRevision: sql<boolean>`${current.revisionId} = ${bomRevisions.id}`,
      drawingRevisionNumber: drawingRevisions.number,
      checkedRevisionNumber: checked.number,
      outdated: isOutdatedSql(impact.number, drawingRevisions.number, checked.number),
    })
    .from(bomRevisionDrawings)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomRevisionDrawings.bomRevisionId))
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, bomRevisionDrawings.drawingRevisionId))
    .leftJoin(checked, eq(checked.id, bomRevisionDrawings.checkedRevisionId))
    .leftJoin(impact, eq(impact.drawingId, bomRevisionDrawings.drawingId))
    .leftJoin(current, eq(current.bomId, boms.id))
    .where(and(eq(bomRevisionDrawings.drawingId, drawingId), isNull(boms.deletedAt)))
    .orderBy(asc(boms.name), desc(bomRevisions.createdAt));
}

export type BomLinkForDrawingRow = Awaited<ReturnType<typeof listBomLinksForDrawing>>[number];

/**
 * Drawings referenced by a BOM revision, with the drawing's latest revision for
 * comparison. Outdated ones carry the revisions made since, so whoever checks
 * them can see what changed.
 */
export async function listDrawingLinksForBomRevision(bomRevisionId: string) {
  await requireSession();
  const latest = latestRevisions();
  const checked = alias(drawingRevisions, "checked_rev");
  const checkedBy = alias(user, "checked_by");
  const impact = bomImpactRevisions();
  const rows = await db
    .select({
      linkId: bomRevisionDrawings.id,
      drawingId: drawings.id,
      code: drawings.code,
      name: drawings.name,
      disciplineName: drawingDisciplines.name,
      deleted: sql<boolean>`${drawings.deletedAt} IS NOT NULL`,
      linkedRevisionId: bomRevisionDrawings.drawingRevisionId,
      linkedRevisionNumber: drawingRevisions.number,
      linkedStatus: drawingRevisions.status,
      checkedRevisionNumber: checked.number,
      checkedByName: checkedBy.name,
      checkedAt: bomRevisionDrawings.checkedAt,
      latestRevisionId: latest.revisionId,
      latestRevisionNumber: latest.number,
      latestStatus: latest.status,
      outdated: isOutdatedSql(impact.number, drawingRevisions.number, checked.number),
    })
    .from(bomRevisionDrawings)
    .innerJoin(drawings, eq(drawings.id, bomRevisionDrawings.drawingId))
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, bomRevisionDrawings.drawingRevisionId))
    .innerJoin(latest, eq(latest.drawingId, drawings.id))
    .leftJoin(checked, eq(checked.id, bomRevisionDrawings.checkedRevisionId))
    .leftJoin(checkedBy, eq(checkedBy.id, bomRevisionDrawings.checkedById))
    .leftJoin(impact, eq(impact.drawingId, drawings.id))
    .leftJoin(drawingDisciplines, eq(drawingDisciplines.id, drawings.disciplineId))
    .where(eq(bomRevisionDrawings.bomRevisionId, bomRevisionId))
    .orderBy(asc(drawings.code));

  const outdated = rows.filter(r => r.outdated);
  const newer = outdated.length
    ? await db
      .select({
        drawingId: drawingRevisions.drawingId,
        number: drawingRevisions.number,
        commitMessage: drawingRevisions.commitMessage,
        bomImpact: drawingRevisions.bomImpact,
      })
      .from(drawingRevisions)
      .where(or(...outdated.map(r => and(
        eq(drawingRevisions.drawingId, r.drawingId),
        gt(drawingRevisions.number, Math.max(r.linkedRevisionNumber, r.checkedRevisionNumber ?? 0)),
      ))))
      .orderBy(asc(drawingRevisions.number))
    : [];
  return rows.map(r => ({
    ...r,
    newerRevisions: newer
      .filter(n => n.drawingId === r.drawingId)
      .map(({ number, commitMessage, bomImpact }) => ({ number, commitMessage, bomImpact })),
  }));
}

export type DrawingLinkRow = Awaited<ReturnType<typeof listDrawingLinksForBomRevision>>[number];

/** Drawings of a project that a BOM in the same project can reference. */
export async function listLinkableDrawings(projectId: string) {
  await requireSession();
  const latest = latestRevisions();
  return db
    .select({
      id: drawings.id,
      code: drawings.code,
      name: drawings.name,
      revisionId: latest.revisionId,
      revisionNumber: latest.number,
      status: latest.status,
    })
    .from(drawings)
    .innerJoin(latest, eq(latest.drawingId, drawings.id))
    .where(and(eq(drawings.projectId, projectId), isNull(drawings.deletedAt)))
    .orderBy(asc(drawings.code));
}

export type LinkableDrawing = Awaited<ReturnType<typeof listLinkableDrawings>>[number];
