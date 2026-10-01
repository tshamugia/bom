import "server-only";
import { aliasedTable, and, count, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  approvalWorkflows,
  bomExports,
  bomLines,
  bomRevisions,
  boms,
  drawingEvents,
  drawingFiles,
  drawingRevisions,
  drawingTransmittals,
  drawings,
  projects,
  user,
} from "@/db/schema";
import { todayIso, type DrawingStatus } from "@/lib/drawing-status";
import { isFileStatus, type DrawingFileGate } from "@/lib/drawing-files";
import { requireSession } from "../auth-context";
import { loadDrawingFileGate } from "../lib/drawing-file-gate";

/** Latest revision per drawing — only it can still be acknowledged or move. */
function latestRevisions() {
  return db
    .selectDistinctOn([drawingRevisions.drawingId], {
      drawingId: drawingRevisions.drawingId,
      revisionId: drawingRevisions.id,
      number: drawingRevisions.number,
    })
    .from(drawingRevisions)
    .orderBy(drawingRevisions.drawingId, desc(drawingRevisions.number))
    .as("latest");
}

/** Current drawing revisions issued to the signed-in user that they haven't confirmed yet. */
export async function countPendingReceipts(): Promise<number> {
  const session = await requireSession();
  const latest = latestRevisions();
  const [row] = await db
    .select({ n: count() })
    .from(drawingTransmittals)
    .innerJoin(latest, eq(latest.revisionId, drawingTransmittals.revisionId))
    .innerJoin(drawings, eq(drawings.id, drawingTransmittals.drawingId))
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .where(and(
      eq(drawingTransmittals.recipientUserId, session.user.id),
      isNull(drawingTransmittals.acknowledgedAt),
      isNull(drawings.deletedAt),
      isNull(projects.deletedAt),
    ));
  return row?.n ?? 0;
}

function transmittalColumns() {
  const recipient = aliasedTable(user, "recipient");
  const sender = aliasedTable(user, "sender");
  return {
    recipient,
    sender,
    columns: {
      id: drawingTransmittals.id,
      drawingId: drawings.id,
      code: drawings.code,
      name: drawings.name,
      projectCode: projects.code,
      revisionNumber: drawingRevisions.number,
      revisionStatus: drawingRevisions.status,
      fileId: sql<string | null>`(
        select ${drawingFiles.id} from ${drawingFiles}
        where ${drawingFiles.revisionId} = ${drawingTransmittals.revisionId}
          and ${drawingFiles.status} = 'ready' and ${drawingFiles.archivedAt} is null
      )`,
      purpose: drawingTransmittals.purpose,
      recipientUserId: drawingTransmittals.recipientUserId,
      recipientName: recipient.name,
      externalName: drawingTransmittals.externalName,
      sentByName: sender.name,
      note: drawingTransmittals.note,
      createdAt: drawingTransmittals.createdAt,
      acknowledgedAt: drawingTransmittals.acknowledgedAt,
    },
  };
}

/**
 * Swaps the raw file id for `pdfFileId`: set only when the revision passed the
 * upload rule and is still current, so nobody is pointed at an outdated drawing.
 */
function withPdf<T extends { fileId: string | null; revisionStatus: DrawingStatus; superseded?: boolean }>(
  rows: T[],
  gate: DrawingFileGate,
) {
  return rows.map(({ fileId, ...r }) => ({
    ...r,
    pdfFileId: fileId && !r.superseded && isFileStatus(r.revisionStatus, gate) ? fileId : null,
  }));
}

const liveDrawing = (projectId?: string) =>
  and(isNull(drawings.deletedAt), isNull(projects.deletedAt), projectId ? eq(drawings.projectId, projectId) : undefined);

/** Drawing revisions issued to anyone, newest first; `superseded` once a newer revision exists. */
export async function listIssuedTransmittals(opts: { projectId?: string; limit?: number } = {}) {
  await requireSession();
  const { recipient, sender, columns } = transmittalColumns();
  const latest = latestRevisions();
  const rows = await db
    .select({ ...columns, superseded: sql<boolean>`${drawingRevisions.number} < ${latest.number}` })
    .from(drawingTransmittals)
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingTransmittals.revisionId))
    .innerJoin(drawings, eq(drawings.id, drawingTransmittals.drawingId))
    .innerJoin(latest, eq(latest.drawingId, drawings.id))
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .leftJoin(recipient, eq(recipient.id, drawingTransmittals.recipientUserId))
    .leftJoin(sender, eq(sender.id, drawingTransmittals.sentById))
    .where(liveDrawing(opts.projectId))
    .orderBy(desc(drawingTransmittals.createdAt))
    .limit(opts.limit ?? 200);
  return withPdf(rows, await loadDrawingFileGate());
}

/** BOM revisions sent to procurement, newest first, with the latest export to download. */
export async function listBomSends(opts: { projectId?: string; limit?: number } = {}) {
  await requireSession();
  return db
    .select({
      id: approvalWorkflows.id,
      requestedAt: approvalWorkflows.requestedAt,
      requestedByName: user.name,
      bomId: boms.id,
      bomName: boms.name,
      projectId: projects.id,
      projectCode: projects.code,
      projectName: projects.name,
      revisionLetter: bomRevisions.letter,
      lineCount: sql<number>`(select count(*) from ${bomLines} where ${bomLines.revisionId} = ${approvalWorkflows.revisionId})`.mapWith(Number),
      exportId: sql<string | null>`(
        select ${bomExports.id} from ${bomExports}
        where ${bomExports.revisionId} = ${approvalWorkflows.revisionId} and ${bomExports.status} = 'exported'
        order by ${bomExports.generatedAt} desc limit 1
      )`,
      exportFileName: sql<string | null>`(
        select ${bomExports.fileName} from ${bomExports}
        where ${bomExports.revisionId} = ${approvalWorkflows.revisionId} and ${bomExports.status} = 'exported'
        order by ${bomExports.generatedAt} desc limit 1
      )`,
    })
    .from(approvalWorkflows)
    .innerJoin(bomRevisions, eq(bomRevisions.id, approvalWorkflows.revisionId))
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .innerJoin(projects, eq(projects.id, boms.projectId))
    .leftJoin(user, eq(user.id, approvalWorkflows.requestedById))
    .where(and(
      sql`${approvalWorkflows.status} <> 'cancelled'`,
      isNull(boms.deletedAt),
      isNull(projects.deletedAt),
      opts.projectId ? eq(boms.projectId, opts.projectId) : undefined,
    ))
    .orderBy(desc(approvalWorkflows.requestedAt))
    .limit(opts.limit ?? 200);
}

/**
 * What the status overview shows besides the drawing summary: revisions waiting
 * for the signed-in user's receipt, and what was sent out lately (drawing
 * issues and BOMs to procurement).
 */
export async function getStatusFeed(opts: { projectId?: string; limit?: number } = {}) {
  const session = await requireSession();
  const limit = opts.limit ?? 12;
  const { recipient, sender, columns } = transmittalColumns();
  const latest = latestRevisions();
  const [mine, issued, bomSends, gate] = await Promise.all([
    db
      .select(columns)
      .from(drawingTransmittals)
      .innerJoin(latest, eq(latest.revisionId, drawingTransmittals.revisionId))
      .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingTransmittals.revisionId))
      .innerJoin(drawings, eq(drawings.id, drawingTransmittals.drawingId))
      .innerJoin(projects, eq(projects.id, drawings.projectId))
      .leftJoin(recipient, eq(recipient.id, drawingTransmittals.recipientUserId))
      .leftJoin(sender, eq(sender.id, drawingTransmittals.sentById))
      .where(and(
        liveDrawing(opts.projectId),
        eq(drawingTransmittals.recipientUserId, session.user.id),
        isNull(drawingTransmittals.acknowledgedAt),
      ))
      .orderBy(desc(drawingTransmittals.createdAt)),
    listIssuedTransmittals({ projectId: opts.projectId, limit }),
    listBomSends({ projectId: opts.projectId, limit }),
    loadDrawingFileGate(),
  ]);
  return { mine: withPdf(mine, gate), issued, bomSends };
}

export type StatusFeed = Awaited<ReturnType<typeof getStatusFeed>>;
export type FeedTransmittal = StatusFeed["issued"][number];
export type FeedBomSend = StatusFeed["bomSends"][number];

/** Tbilisi day each latest revision last moved to Awaiting approval, keyed by drawing id. */
export async function getAwaitingSince(drawingIds: string[]): Promise<Map<string, string>> {
  if (drawingIds.length === 0) return new Map();
  await requireSession();
  const latest = latestRevisions();
  const rows = await db
    .select({ drawingId: latest.drawingId, at: max(drawingEvents.createdAt) })
    .from(drawingEvents)
    .innerJoin(latest, eq(latest.revisionId, drawingEvents.revisionId))
    .where(and(
      inArray(latest.drawingId, drawingIds),
      eq(drawingEvents.kind, "status"),
      eq(drawingEvents.toStatus, "awaiting-approval"),
    ))
    .groupBy(latest.drawingId);
  return new Map(rows.filter(r => r.at).map(r => [r.drawingId, todayIso(new Date(r.at!))]));
}
