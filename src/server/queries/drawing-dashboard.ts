import "server-only";
import { and, count, desc, eq, inArray, isNotNull, isNull, max } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  bomRevisionDrawings,
  bomRevisions,
  boms,
  drawingEvents,
  drawingRevisions,
  drawingSharedTimeEntries,
  drawingSharedTimeMembers,
  drawingTransmittals,
  drawings,
  projects,
} from "@/db/schema";
import { todayIso } from "@/lib/drawing-status";
import type { DashboardDrawing, SharedTimeEntry } from "@/lib/drawing-dashboard";
import { requireSession } from "../auth-context";
import { bomImpactRevisions, isOutdatedSql } from "../lib/bom-drawing-outdated";
import { listDrawings } from "./drawings";

function latestDrawingRevisions() {
  return db
    .selectDistinctOn([drawingRevisions.drawingId], {
      drawingId: drawingRevisions.drawingId,
      revisionId: drawingRevisions.id,
      number: drawingRevisions.number,
      label: drawingRevisions.label,
    })
    .from(drawingRevisions)
    .orderBy(drawingRevisions.drawingId, desc(drawingRevisions.number))
    .as("latest");
}

/**
 * BOMs whose current revision is built from a drawing that has since changed
 * the BOM — in one project, or only the BOMs one user owns. No session check:
 * callers have done it.
 */
export async function listOutdatedBomReferences(opts: { projectId?: string; ownerId?: string } = {}) {
  const { projectId, ownerId } = opts;
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
  const linked = alias(drawingRevisions, "linked");
  const checked = alias(drawingRevisions, "checked");
  const impact = bomImpactRevisions();

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
      linkedLabel: linked.label,
      latestNumber: latest.number,
      latestLabel: latest.label,
    })
    .from(bomRevisionDrawings)
    .innerJoin(current, eq(current.revisionId, bomRevisionDrawings.bomRevisionId))
    .innerJoin(boms, eq(boms.id, current.bomId))
    .innerJoin(projects, eq(projects.id, boms.projectId))
    .innerJoin(drawings, eq(drawings.id, bomRevisionDrawings.drawingId))
    .innerJoin(linked, eq(linked.id, bomRevisionDrawings.drawingRevisionId))
    .innerJoin(latest, eq(latest.drawingId, drawings.id))
    .leftJoin(checked, eq(checked.id, bomRevisionDrawings.checkedRevisionId))
    .leftJoin(impact, eq(impact.drawingId, drawings.id))
    .where(and(
      isOutdatedSql(impact.number, linked.number, checked.number),
      isNull(boms.deletedAt),
      isNull(projects.deletedAt),
      isNull(drawings.deletedAt),
      projectId ? eq(boms.projectId, projectId) : undefined,
      ownerId ? eq(boms.ownerId, ownerId) : undefined,
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

/**
 * Shared time entries with their live drawings (in one project, or all), for
 * `summarizeDrawings` to count once. Entries whose drawings were all archived
 * drop out. No session check: callers have done it.
 */
export async function listSharedTimeForTotals(opts: { projectId?: string } = {}): Promise<SharedTimeEntry[]> {
  const rows = await db
    .select({
      id: drawingSharedTimeEntries.id,
      projectId: drawingSharedTimeEntries.projectId,
      hours: drawingSharedTimeEntries.hours,
      drawingId: drawingSharedTimeMembers.drawingId,
    })
    .from(drawingSharedTimeEntries)
    .innerJoin(drawingSharedTimeMembers, eq(drawingSharedTimeMembers.sharedEntryId, drawingSharedTimeEntries.id))
    .innerJoin(drawings, eq(drawings.id, drawingSharedTimeMembers.drawingId))
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .where(and(
      isNull(drawings.deletedAt),
      isNull(projects.deletedAt),
      opts.projectId ? eq(drawings.projectId, opts.projectId) : undefined,
    ));
  const byId = new Map<string, SharedTimeEntry>();
  for (const r of rows) {
    const e = byId.get(r.id) ?? { id: r.id, projectId: r.projectId, hours: r.hours, drawingIds: [] };
    e.drawingIds.push(r.drawingId);
    byId.set(r.id, e);
  }
  return [...byId.values()];
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
    revisionLabel: r.revisionLabel,
    status: r.status,
    reviewerName: r.reviewerName,
    dueDate: r.dueDate,
    estimatedHours: r.estimatedHours,
    loggedHours: r.loggedHours,
    sharedHours: r.sharedHours,
    openRemarks: r.openRemarks,
    needApprovalSince: since.get(r.revisionId) ?? null,
  }));

  const [outdatedBoms, openTransmittals, sharedTime] = await Promise.all([
    listOutdatedBomReferences({ projectId: opts.projectId }),
    countOpenTransmittals(opts.projectId),
    listSharedTimeForTotals({ projectId: opts.projectId }),
  ]);
  return { drawings: drawingRows, sharedTime, outdatedBoms, openTransmittals };
}

export type DrawingDashboardData = Awaited<ReturnType<typeof getDrawingDashboard>>;
