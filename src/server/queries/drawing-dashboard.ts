import "server-only";
import { aliasedTable, and, count, desc, eq, inArray, isNotNull, isNull, lt, max } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bomRevisionDrawings,
  bomRevisions,
  boms,
  drawingEvents,
  drawingRevisions,
  drawingTransmittals,
  drawings,
  projects,
} from "@/db/schema";
import { todayIso } from "@/lib/drawing-status";
import type { DashboardDrawing } from "@/lib/drawing-dashboard";
import { requireSession } from "../auth-context";
import { listDrawings } from "./drawings";

function latestDrawingRevisions() {
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

/** BOMs whose current revision references an older revision of a drawing. */
async function listOutdatedBomReferences(projectId?: string) {
  const current = db
    .selectDistinctOn([bomRevisions.bomId], {
      bomId: bomRevisions.bomId,
      revisionId: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
    })
    .from(bomRevisions)
    .orderBy(bomRevisions.bomId, desc(bomRevisions.createdAt))
    .as("current_rev");
  const latest = latestDrawingRevisions();
  const linked = aliasedTable(drawingRevisions, "linked");

  return db
    .select({
      bomId: boms.id,
      bomName: boms.name,
      projectId: projects.id,
      projectCode: projects.code,
      bomRevisionLetter: current.letter,
      bomRevisionStatus: current.status,
      drawingId: drawings.id,
      code: drawings.code,
      linkedNumber: linked.number,
      latestNumber: latest.number,
    })
    .from(bomRevisionDrawings)
    .innerJoin(current, eq(current.revisionId, bomRevisionDrawings.bomRevisionId))
    .innerJoin(boms, eq(boms.id, current.bomId))
    .innerJoin(projects, eq(projects.id, boms.projectId))
    .innerJoin(drawings, eq(drawings.id, bomRevisionDrawings.drawingId))
    .innerJoin(linked, eq(linked.id, bomRevisionDrawings.drawingRevisionId))
    .innerJoin(latest, eq(latest.drawingId, drawings.id))
    .where(and(
      lt(linked.number, latest.number),
      isNull(boms.deletedAt),
      isNull(projects.deletedAt),
      isNull(drawings.deletedAt),
      projectId ? eq(boms.projectId, projectId) : undefined,
    ))
    .orderBy(projects.code, boms.name, drawings.code);
}

export type OutdatedBomReference = Awaited<ReturnType<typeof listOutdatedBomReferences>>[number];

async function countOpenTransmittals(projectId?: string) {
  const latest = latestDrawingRevisions();
  const [row] = await db
    .select({ n: count() })
    .from(drawingTransmittals)
    .innerJoin(latest, eq(latest.revisionId, drawingTransmittals.revisionId))
    .innerJoin(drawings, eq(drawings.id, drawingTransmittals.drawingId))
    .where(and(
      isNull(drawingTransmittals.acknowledgedAt),
      isNotNull(drawingTransmittals.recipientUserId),
      isNull(drawings.deletedAt),
      projectId ? eq(drawings.projectId, projectId) : undefined,
    ));
  return row?.n ?? 0;
}

export async function getDrawingDashboard(opts: { projectId?: string } = {}) {
  await requireSession();
  const rows = await listDrawings({ projectIds: opts.projectId ? [opts.projectId] : undefined });

  const inReview = rows.filter(r => r.status === "need-approval").map(r => r.revisionId);
  const requested = inReview.length
    ? await db
        .select({ revisionId: drawingEvents.revisionId, at: max(drawingEvents.createdAt) })
        .from(drawingEvents)
        .where(and(
          inArray(drawingEvents.revisionId, inReview),
          eq(drawingEvents.kind, "status"),
          eq(drawingEvents.toStatus, "need-approval"),
        ))
        .groupBy(drawingEvents.revisionId)
    : [];
  const since = new Map(requested.map(r => [r.revisionId, r.at ? todayIso(new Date(r.at)) : null]));

  const drawingRows: DashboardDrawing[] = rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    projectId: r.projectId,
    projectCode: r.projectCode,
    projectName: r.projectName,
    disciplineName: r.disciplineName,
    ownerId: r.ownerId,
    ownerName: r.ownerName,
    revisionNumber: r.revisionNumber,
    status: r.status,
    reviewerName: r.reviewerName,
    dueDate: r.dueDate,
    estimatedHours: r.estimatedHours,
    loggedHours: r.loggedHours,
    openRemarks: r.openRemarks,
    needApprovalSince: since.get(r.revisionId) ?? null,
  }));

  const [outdatedBoms, openTransmittals] = await Promise.all([
    listOutdatedBomReferences(opts.projectId),
    countOpenTransmittals(opts.projectId),
  ]);
  return { drawings: drawingRows, outdatedBoms, openTransmittals };
}

export type DrawingDashboardData = Awaited<ReturnType<typeof getDrawingDashboard>>;
