import "server-only";
import { cache } from "react";
import { aliasedTable, and, count, desc, eq, gt, inArray, isNull, max, min, ne, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  auditLog,
  bomRevisions,
  boms,
  drawingEvents,
  drawingRemarks,
  drawingRevisions,
  drawingTransmittals,
  drawings,
  myWorkSeen,
  projects,
  user,
} from "@/db/schema";
import { isClosedStatus, todayIso, type DrawingStatus } from "@/lib/drawing-status";
import {
  MY_WORK_UPDATE_DAYS,
  bellCount,
  collectDeadlines,
  collectWaiting,
  countMyWork,
  describeUpdate,
  groupBomTasks,
  updatesSince,
  type ApprovalTask,
  type MyDrawing,
  type MyWorkUpdate,
  type RawUpdate,
  type RemarkTask,
} from "@/lib/my-work";
import { requireSession } from "../auth-context";
import { listDeadlines } from "./dashboard";
import { listOutdatedBomReferences } from "./drawing-dashboard";
import { listMyPendingReceipts } from "./status-overview";

const MS_PER_DAY = 86_400_000;
/** Most updates the page lists (and counts as new on the bell). */
const UPDATE_LIMIT = 40;

function latestRevisions() {
  return db
    .selectDistinctOn([drawingRevisions.drawingId], {
      drawingId: drawingRevisions.drawingId,
      revisionId: drawingRevisions.id,
      number: drawingRevisions.number,
      status: drawingRevisions.status,
      reviewerId: drawingRevisions.reviewerId,
    })
    .from(drawingRevisions)
    .orderBy(drawingRevisions.drawingId, desc(drawingRevisions.number))
    .as("latest");
}

const liveDrawing = () => and(isNull(drawings.deletedAt), isNull(projects.deletedAt));

/** Rows written by someone else — a deleted actor counts as someone else. */
const notBy = (column: AnyPgColumn, userId: string) => or(isNull(column), ne(column, userId));

/** Tbilisi day each revision last moved to `status`, by revision id. */
async function lastMovedTo(revisionIds: string[], status: DrawingStatus): Promise<Map<string, string>> {
  if (revisionIds.length === 0) return new Map();
  const rows = await db
    .select({ revisionId: drawingEvents.revisionId, at: max(drawingEvents.createdAt) })
    .from(drawingEvents)
    .where(and(
      inArray(drawingEvents.revisionId, revisionIds),
      eq(drawingEvents.kind, "status"),
      eq(drawingEvents.toStatus, status),
    ))
    .groupBy(drawingEvents.revisionId);
  return new Map(rows.filter(r => r.at).map(r => [r.revisionId, todayIso(new Date(r.at!))]));
}

/** Latest revisions waiting for this user's internal approval, oldest request first. */
async function loadApprovals(userId: string): Promise<ApprovalTask[]> {
  const latest = latestRevisions();
  const owner = aliasedTable(user, "owner");
  const rows = await db
    .select({
      drawingId: drawings.id,
      code: drawings.code,
      name: drawings.name,
      projectCode: projects.code,
      revisionId: latest.revisionId,
      revisionNumber: latest.number,
      ownerName: owner.name,
    })
    .from(drawings)
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .innerJoin(latest, eq(latest.drawingId, drawings.id))
    .leftJoin(owner, eq(owner.id, drawings.ownerId))
    .where(and(liveDrawing(), eq(latest.status, "need-approval"), eq(latest.reviewerId, userId)));
  const since = await lastMovedTo(rows.map(r => r.revisionId), "need-approval");
  return rows
    .map(({ revisionId, ...r }) => ({ ...r, since: since.get(revisionId) ?? null }))
    .sort((a, b) => (a.since ?? "~").localeCompare(b.since ?? "~") || a.code.localeCompare(b.code));
}

/** Open drawings the user owns, with the day the latest revision started waiting for approval. */
async function loadMyDrawings(userId: string): Promise<MyDrawing[]> {
  const latest = latestRevisions();
  const reviewer = aliasedTable(user, "reviewer");
  const rows = await db
    .select({
      id: drawings.id,
      code: drawings.code,
      name: drawings.name,
      projectCode: projects.code,
      revisionId: latest.revisionId,
      revisionNumber: latest.number,
      status: latest.status,
      dueDate: drawings.dueDate,
      reviewerName: reviewer.name,
    })
    .from(drawings)
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .innerJoin(latest, eq(latest.drawingId, drawings.id))
    .leftJoin(reviewer, eq(reviewer.id, latest.reviewerId))
    .where(and(liveDrawing(), eq(drawings.ownerId, userId)));
  const open = rows.filter(r => !isClosedStatus(r.status));
  const [requested, awaiting] = await Promise.all([
    lastMovedTo(open.filter(r => r.status === "need-approval").map(r => r.revisionId), "need-approval"),
    lastMovedTo(open.filter(r => r.status === "awaiting-approval").map(r => r.revisionId), "awaiting-approval"),
  ]);
  return open.map(({ revisionId, ...r }) => ({
    ...r,
    waitingSince: requested.get(revisionId) ?? awaiting.get(revisionId) ?? null,
  }));
}

/** Drawings the user owns that have open remarks, oldest remark first. */
async function loadRemarks(userId: string): Promise<RemarkTask[]> {
  const rows = await db
    .select({
      drawingId: drawings.id,
      code: drawings.code,
      name: drawings.name,
      projectCode: projects.code,
      open: count(),
      oldest: min(drawingRemarks.createdAt),
      latestBody: sql<string | null>`(
        select r2.body from drawing_remark r2
        where r2.drawing_id = ${drawings.id} and r2.resolved_at is null
        order by r2.created_at desc limit 1
      )`,
    })
    .from(drawingRemarks)
    .innerJoin(drawings, eq(drawings.id, drawingRemarks.drawingId))
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .where(and(isNull(drawingRemarks.resolvedAt), eq(drawings.ownerId, userId), liveDrawing()))
    .groupBy(drawings.id, projects.code);
  return rows
    .map(({ oldest, ...r }) => ({ ...r, oldestDay: oldest ? todayIso(new Date(oldest)) : null }))
    .sort((a, b) => (a.oldestDay ?? "~").localeCompare(b.oldestDay ?? "~") || a.code.localeCompare(b.code));
}

async function loadSeenAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ seenAt: myWorkSeen.seenAt })
    .from(myWorkSeen)
    .where(eq(myWorkSeen.userId, userId))
    .limit(1);
  return row?.seenAt ?? null;
}

/** Drawings the user owns, approves (or approved), commented on or raised a remark against. */
function involvedIn(userId: string) {
  return or(
    eq(drawings.ownerId, userId),
    sql`exists (select 1 from drawing_revision iv where iv.drawing_id = ${drawings.id} and iv.reviewer_id = ${userId})`,
    sql`exists (select 1 from drawing_event iv where iv.drawing_id = ${drawings.id} and iv.kind = 'comment' and iv.actor_id = ${userId})`,
    sql`exists (select 1 from drawing_remark iv where iv.drawing_id = ${drawings.id} and iv.raised_by_id = ${userId})`,
  );
}

/**
 * What other people did on the user's work since `since`, newest first:
 * comments and changes on drawings they're involved in, remarks, revisions
 * issued to them, and status changes or handovers of BOMs they own.
 */
async function loadUpdates(userId: string, since: Date): Promise<MyWorkUpdate[]> {
  const actor = aliasedTable(user, "actor");
  const drawingColumns = {
    drawingId: drawings.id,
    code: drawings.code,
    name: drawings.name,
    projectCode: projects.code,
    revisionNumber: drawingRevisions.number,
  };

  const [events, raised, resolved, issued, bomStatus, bomOwner] = await Promise.all([
    db
      .select({
        ...drawingColumns,
        id: drawingEvents.id,
        kind: drawingEvents.kind,
        at: drawingEvents.createdAt,
        actorName: actor.name,
        fromStatus: drawingEvents.fromStatus,
        toStatus: drawingEvents.toStatus,
        body: drawingEvents.body,
        reviewerIsMe: sql<boolean>`coalesce(${drawingRevisions.reviewerId} = ${userId}, false)`,
      })
      .from(drawingEvents)
      .innerJoin(drawings, eq(drawings.id, drawingEvents.drawingId))
      .innerJoin(projects, eq(projects.id, drawings.projectId))
      .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingEvents.revisionId))
      .leftJoin(actor, eq(actor.id, drawingEvents.actorId))
      .where(and(gt(drawingEvents.createdAt, since), notBy(drawingEvents.actorId, userId), liveDrawing(), involvedIn(userId)))
      .orderBy(desc(drawingEvents.createdAt))
      .limit(UPDATE_LIMIT),
    db
      .select({
        ...drawingColumns,
        id: drawingRemarks.id,
        at: drawingRemarks.createdAt,
        actorName: actor.name,
        remarkSource: drawingRemarks.source,
        body: drawingRemarks.body,
        resolution: drawingRemarks.resolution,
      })
      .from(drawingRemarks)
      .innerJoin(drawings, eq(drawings.id, drawingRemarks.drawingId))
      .innerJoin(projects, eq(projects.id, drawings.projectId))
      .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingRemarks.revisionId))
      .leftJoin(actor, eq(actor.id, drawingRemarks.raisedById))
      .where(and(gt(drawingRemarks.createdAt, since), notBy(drawingRemarks.raisedById, userId), liveDrawing(), involvedIn(userId)))
      .orderBy(desc(drawingRemarks.createdAt))
      .limit(UPDATE_LIMIT),
    db
      .select({
        ...drawingColumns,
        id: drawingRemarks.id,
        at: drawingRemarks.resolvedAt,
        actorName: actor.name,
        remarkSource: drawingRemarks.source,
        body: drawingRemarks.body,
        resolution: drawingRemarks.resolution,
      })
      .from(drawingRemarks)
      .innerJoin(drawings, eq(drawings.id, drawingRemarks.drawingId))
      .innerJoin(projects, eq(projects.id, drawings.projectId))
      .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingRemarks.revisionId))
      .leftJoin(actor, eq(actor.id, drawingRemarks.resolvedById))
      .where(and(
        gt(drawingRemarks.resolvedAt, since),
        eq(drawingRemarks.raisedById, userId),
        notBy(drawingRemarks.resolvedById, userId),
        liveDrawing(),
      ))
      .orderBy(desc(drawingRemarks.resolvedAt))
      .limit(UPDATE_LIMIT),
    db
      .select({
        ...drawingColumns,
        id: drawingTransmittals.id,
        at: drawingTransmittals.createdAt,
        actorName: actor.name,
        purpose: drawingTransmittals.purpose,
        note: drawingTransmittals.note,
      })
      .from(drawingTransmittals)
      .innerJoin(drawings, eq(drawings.id, drawingTransmittals.drawingId))
      .innerJoin(projects, eq(projects.id, drawings.projectId))
      .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingTransmittals.revisionId))
      .leftJoin(actor, eq(actor.id, drawingTransmittals.sentById))
      .where(and(
        gt(drawingTransmittals.createdAt, since),
        eq(drawingTransmittals.recipientUserId, userId),
        notBy(drawingTransmittals.sentById, userId),
        liveDrawing(),
      ))
      .orderBy(desc(drawingTransmittals.createdAt))
      .limit(UPDATE_LIMIT),
    db
      .select({
        id: bomRevisions.id,
        at: bomRevisions.statusChangedAt,
        actorName: actor.name,
        bomId: boms.id,
        projectId: projects.id,
        projectCode: projects.code,
        bomName: boms.name,
        revisionLetter: bomRevisions.letter,
        status: bomRevisions.status,
        comment: bomRevisions.statusComment,
      })
      .from(bomRevisions)
      .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
      .innerJoin(projects, eq(projects.id, boms.projectId))
      .leftJoin(actor, eq(actor.id, bomRevisions.statusChangedById))
      .where(and(
        gt(bomRevisions.statusChangedAt, since),
        eq(boms.ownerId, userId),
        notBy(bomRevisions.statusChangedById, userId),
        isNull(boms.deletedAt),
        isNull(projects.deletedAt),
      ))
      .orderBy(desc(bomRevisions.statusChangedAt))
      .limit(UPDATE_LIMIT),
    // A new revision with a new owner (`branchRevision({ ownerId })`) is only recorded in the audit log.
    db
      .select({
        id: auditLog.id,
        at: auditLog.createdAt,
        actorName: actor.name,
        bomId: boms.id,
        projectId: projects.id,
        projectCode: projects.code,
        bomName: boms.name,
        revisionLetter: sql<string>`coalesce(${auditLog.payload}->>'letter', '')`,
      })
      .from(auditLog)
      .innerJoin(boms, eq(boms.id, auditLog.refId))
      .innerJoin(projects, eq(projects.id, boms.projectId))
      .leftJoin(actor, eq(actor.id, auditLog.actorId))
      .where(and(
        eq(auditLog.kind, "bom.revision.branched"),
        gt(auditLog.createdAt, since),
        sql`${auditLog.payload}->>'ownerId' = ${userId}`,
        sql`${auditLog.payload}->>'previousOwnerId' is not null`,
        notBy(auditLog.actorId, userId),
        isNull(boms.deletedAt),
        isNull(projects.deletedAt),
      ))
      .orderBy(desc(auditLog.createdAt))
      .limit(UPDATE_LIMIT),
  ]);

  const raw: RawUpdate[] = [
    ...events.map(e => ({ ...e, id: `event:${e.id}`, source: "drawing-event" as const })),
    ...raised.map(r => ({ ...r, id: `remark:${r.id}`, source: "remark" as const, resolved: false })),
    ...resolved.map(r => ({ ...r, at: r.at!, id: `resolved:${r.id}`, source: "remark" as const, resolved: true })),
    ...issued.map(t => ({ ...t, id: `issued:${t.id}`, source: "transmittal" as const })),
    ...bomStatus.map(b => ({ ...b, at: b.at!, id: `bom-status:${b.id}`, source: "bom-status" as const })),
    ...bomOwner.map(b => ({ ...b, id: `bom-owner:${b.id}`, source: "bom-owner" as const })),
  ];
  return raw
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, UPDATE_LIMIT)
    .map(describeUpdate);
}

/** Per request, so the layout's bell and the page (or dashboard) share one load. */
const loadMyWork = cache(async (userId: string) => {
  const now = new Date();
  const today = todayIso(now);
  const windowStart = new Date(now.getTime() - MY_WORK_UPDATE_DAYS * MS_PER_DAY);

  const [approvals, receipts, remarks, outdated, myDrawings, projectDates, seenAt, updates] = await Promise.all([
    loadApprovals(userId),
    listMyPendingReceipts(),
    loadRemarks(userId),
    listOutdatedBomReferences({ ownerId: userId }),
    loadMyDrawings(userId),
    listDeadlines({ ownerId: userId }),
    loadSeenAt(userId),
    loadUpdates(userId, windowStart),
  ]);

  const since = updatesSince(seenAt, now);
  const bomTasks = groupBomTasks(outdated);
  const deadlines = collectDeadlines(myDrawings, projectDates, today);
  const counts = countMyWork({
    approvals: approvals.length,
    receipts: receipts.length,
    remarks: remarks.length,
    boms: bomTasks.length,
    deadlines,
    newUpdates: updates.filter(u => u.at > since).length,
    today,
  });

  return {
    today,
    approvals,
    receipts,
    remarks,
    boms: bomTasks,
    deadlines,
    waiting: collectWaiting(myDrawings, today),
    updates,
    /** Updates after this are new to the user. */
    since,
    counts,
  };
});

/** Everything My work shows for the signed-in user. */
export async function getMyWork() {
  const session = await requireSession();
  return loadMyWork(session.user.id);
}

export type MyWork = Awaited<ReturnType<typeof getMyWork>>;

/** The number on the bell — see `bellCount`. */
export async function getMyWorkBellCount(): Promise<number> {
  return bellCount((await getMyWork()).counts);
}
