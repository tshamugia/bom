import "server-only";
import { aliasedTable, and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  drawings,
  drawingDisciplines,
  drawingEvents,
  drawingNotifyRecipients,
  drawingReminderRecipients,
  drawingReminderRuns,
  drawingRemarks,
  drawingRevisions,
  drawingTimeEntries,
  drawingTransmittals,
  projects,
  user,
} from "@/db/schema";
import { requireSession } from "../auth-context";
import { loadReminderConfig } from "../lib/drawing-reminder-run";

export type DrawingListFilter = {
  projectIds?: string[];
  disciplineIds?: string[];
  ownerIds?: string[];
  /** Only drawings with a transmittal issued to this user. */
  receivedBy?: string;
  search?: string;
};

function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
}

export async function listDrawings(filter: DrawingListFilter = {}) {
  await requireSession();

  const latest = db
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
  const owner = aliasedTable(user, "owner");
  const modifier = aliasedTable(user, "modifier");
  const reviewer = aliasedTable(user, "reviewer");
  const logged = db
    .select({
      drawingId: drawingTimeEntries.drawingId,
      hours: sql<number>`sum(${drawingTimeEntries.hours})`.as("logged_hours"),
    })
    .from(drawingTimeEntries)
    .groupBy(drawingTimeEntries.drawingId)
    .as("logged");
  const remarks = db
    .select({
      drawingId: drawingRemarks.drawingId,
      open: sql<number>`count(*)`.as("open_remarks"),
    })
    .from(drawingRemarks)
    .where(isNull(drawingRemarks.resolvedAt))
    .groupBy(drawingRemarks.drawingId)
    .as("remarks");

  const conds: SQL[] = [isNull(drawings.deletedAt), isNull(projects.deletedAt)];
  if (filter.projectIds?.length) conds.push(inArray(drawings.projectId, filter.projectIds));
  if (filter.disciplineIds?.length) conds.push(inArray(drawings.disciplineId, filter.disciplineIds));
  if (filter.ownerIds?.length) conds.push(inArray(drawings.ownerId, filter.ownerIds));
  if (filter.receivedBy) {
    conds.push(sql`exists (select 1 from ${drawingTransmittals} where ${drawingTransmittals.drawingId} = ${drawings.id} and ${drawingTransmittals.recipientUserId} = ${filter.receivedBy})`);
  }
  const q = filter.search?.trim();
  if (q) conds.push(or(ilike(drawings.code, likePattern(q)), ilike(drawings.name, likePattern(q)))!);

  return db
    .select({
      id: drawings.id,
      code: drawings.code,
      name: drawings.name,
      dueDate: drawings.dueDate,
      estimatedHours: drawings.estimatedHours,
      loggedHours: sql<number>`coalesce(${logged.hours}, 0)`.mapWith(Number),
      openRemarks: sql<number>`coalesce(${remarks.open}, 0)`.mapWith(Number),
      updatedAt: drawings.updatedAt,
      projectId: projects.id,
      projectCode: projects.code,
      projectName: projects.name,
      disciplineId: drawings.disciplineId,
      disciplineName: drawingDisciplines.name,
      ownerId: drawings.ownerId,
      ownerName: owner.name,
      lastModifiedByName: modifier.name,
      revisionId: latest.revisionId,
      revisionNumber: latest.number,
      status: latest.status,
      reviewerId: latest.reviewerId,
      reviewerName: reviewer.name,
    })
    .from(drawings)
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .innerJoin(latest, eq(latest.drawingId, drawings.id))
    .leftJoin(drawingDisciplines, eq(drawingDisciplines.id, drawings.disciplineId))
    .leftJoin(owner, eq(owner.id, drawings.ownerId))
    .leftJoin(modifier, eq(modifier.id, drawings.lastModifiedById))
    .leftJoin(reviewer, eq(reviewer.id, latest.reviewerId))
    .leftJoin(logged, eq(logged.drawingId, drawings.id))
    .leftJoin(remarks, eq(remarks.drawingId, drawings.id))
    .where(and(...conds))
    .orderBy(desc(drawings.updatedAt));
}

export type DrawingListRow = Awaited<ReturnType<typeof listDrawings>>[number];

export async function getDrawing(id: string) {
  await requireSession();
  const owner = aliasedTable(user, "owner");
  const creator = aliasedTable(user, "creator");
  const modifier = aliasedTable(user, "modifier");
  const [row] = await db
    .select({
      id: drawings.id,
      code: drawings.code,
      name: drawings.name,
      dueDate: drawings.dueDate,
      estimatedHours: drawings.estimatedHours,
      fileLocation: drawings.fileLocation,
      createdAt: drawings.createdAt,
      updatedAt: drawings.updatedAt,
      projectId: projects.id,
      projectCode: projects.code,
      projectName: projects.name,
      disciplineId: drawings.disciplineId,
      disciplineName: drawingDisciplines.name,
      ownerId: drawings.ownerId,
      ownerName: owner.name,
      createdByName: creator.name,
      lastModifiedByName: modifier.name,
    })
    .from(drawings)
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .leftJoin(drawingDisciplines, eq(drawingDisciplines.id, drawings.disciplineId))
    .leftJoin(owner, eq(owner.id, drawings.ownerId))
    .leftJoin(creator, eq(creator.id, drawings.createdById))
    .leftJoin(modifier, eq(modifier.id, drawings.lastModifiedById))
    .where(and(eq(drawings.id, id), isNull(drawings.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function listDrawingRevisions(drawingId: string) {
  await requireSession();
  const creator = aliasedTable(user, "creator");
  const reviewer = aliasedTable(user, "reviewer");
  const reviewedBy = aliasedTable(user, "reviewed_by");
  return db
    .select({
      id: drawingRevisions.id,
      number: drawingRevisions.number,
      status: drawingRevisions.status,
      commitMessage: drawingRevisions.commitMessage,
      bomImpact: drawingRevisions.bomImpact,
      reviewerId: drawingRevisions.reviewerId,
      reviewerName: reviewer.name,
      reviewedByName: reviewedBy.name,
      reviewedAt: drawingRevisions.reviewedAt,
      createdByName: creator.name,
      createdAt: drawingRevisions.createdAt,
      lockedAt: drawingRevisions.lockedAt,
    })
    .from(drawingRevisions)
    .leftJoin(creator, eq(creator.id, drawingRevisions.createdById))
    .leftJoin(reviewer, eq(reviewer.id, drawingRevisions.reviewerId))
    .leftJoin(reviewedBy, eq(reviewedBy.id, drawingRevisions.reviewedById))
    .where(eq(drawingRevisions.drawingId, drawingId))
    .orderBy(desc(drawingRevisions.number));
}

export type DrawingRevisionRow = Awaited<ReturnType<typeof listDrawingRevisions>>[number];

export async function listDrawingEvents(drawingId: string) {
  await requireSession();
  return db
    .select({
      id: drawingEvents.id,
      revisionId: drawingEvents.revisionId,
      kind: drawingEvents.kind,
      fromStatus: drawingEvents.fromStatus,
      toStatus: drawingEvents.toStatus,
      body: drawingEvents.body,
      actorName: user.name,
      createdAt: drawingEvents.createdAt,
    })
    .from(drawingEvents)
    .leftJoin(user, eq(user.id, drawingEvents.actorId))
    .where(eq(drawingEvents.drawingId, drawingId))
    .orderBy(asc(drawingEvents.createdAt), asc(drawingEvents.id));
}

export type DrawingEventRow = Awaited<ReturnType<typeof listDrawingEvents>>[number];

export async function listDisciplines() {
  await requireSession();
  return db
    .select({
      id: drawingDisciplines.id,
      name: drawingDisciplines.name,
      drawingCount: count(drawings.id),
    })
    .from(drawingDisciplines)
    .leftJoin(drawings, and(eq(drawings.disciplineId, drawingDisciplines.id), isNull(drawings.deletedAt)))
    .groupBy(drawingDisciplines.id)
    .orderBy(asc(drawingDisciplines.position), asc(drawingDisciplines.name));
}

export async function listProjectOptions() {
  await requireSession();
  return db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .orderBy(asc(projects.code));
}

/** `projectId = null` returns the list notified about every project. */
export async function getDrawingRecipientIds(projectId: string | null): Promise<string[]> {
  await requireSession();
  const rows = await db
    .select({ userId: drawingNotifyRecipients.userId })
    .from(drawingNotifyRecipients)
    .where(projectId ? eq(drawingNotifyRecipients.projectId, projectId) : isNull(drawingNotifyRecipients.projectId));
  return rows.map(r => r.userId);
}

/** `projectId = null` returns the managers who get reminders about every project. */
export async function getReminderRecipientIds(projectId: string | null): Promise<string[]> {
  await requireSession();
  const rows = await db
    .select({ userId: drawingReminderRecipients.userId })
    .from(drawingReminderRecipients)
    .where(projectId ? eq(drawingReminderRecipients.projectId, projectId) : isNull(drawingReminderRecipients.projectId));
  return rows.map(r => r.userId);
}

export async function getReminderSettings() {
  await requireSession();
  const [config, [lastRun]] = await Promise.all([
    loadReminderConfig(),
    db
      .select({
        day: drawingReminderRuns.day,
        recipients: drawingReminderRuns.recipients,
        finishedAt: drawingReminderRuns.finishedAt,
      })
      .from(drawingReminderRuns)
      .orderBy(desc(drawingReminderRuns.day))
      .limit(1),
  ]);
  return { config, lastRun: lastRun ?? null };
}
