// Pure aggregation for the drawings dashboard and its Excel/PDF reports, so
// all three always show the same numbers. No server-only or DB imports.

import { DRAWING_STATUSES, isClosedStatus, type DrawingStatus } from "./drawing-status";
import { addDays, daysBetween } from "./drawing-reminders";

export type DashboardDrawing = {
  id: string;
  code: string;
  name: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  disciplineName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  revisionNumber: number;
  status: DrawingStatus;
  reviewerName: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  loggedHours: number;
  openRemarks: number;
  /** Tbilisi day the latest revision last asked for internal approval. */
  needApprovalSince: string | null;
};

export type StatusCounts = Record<DrawingStatus, number>;

export type GroupSummary = {
  key: string;
  label: string;
  sublabel?: string;
  total: number;
  closed: number;
  overdue: number;
  openRemarks: number;
  estimatedHours: number;
  loggedHours: number;
  byStatus: StatusCounts;
};

export const DUE_SOON_DAYS = 7;

function emptyCounts(): StatusCounts {
  return Object.fromEntries(DRAWING_STATUSES.map(s => [s, 0])) as StatusCounts;
}

export function isOverdueOn(d: Pick<DashboardDrawing, "dueDate" | "status">, today: string): boolean {
  return !!d.dueDate && d.dueDate < today && !isClosedStatus(d.status);
}

function group(
  rows: DashboardDrawing[],
  today: string,
  keyOf: (d: DashboardDrawing) => { key: string; label: string; sublabel?: string },
): GroupSummary[] {
  const map = new Map<string, GroupSummary>();
  for (const d of rows) {
    const k = keyOf(d);
    const g = map.get(k.key) ?? {
      ...k,
      total: 0,
      closed: 0,
      overdue: 0,
      openRemarks: 0,
      estimatedHours: 0,
      loggedHours: 0,
      byStatus: emptyCounts(),
    };
    g.total++;
    g.byStatus[d.status]++;
    if (isClosedStatus(d.status)) g.closed++;
    if (isOverdueOn(d, today)) g.overdue++;
    g.openRemarks += d.openRemarks;
    g.estimatedHours += d.estimatedHours ?? 0;
    g.loggedHours += d.loggedHours;
    map.set(k.key, g);
  }
  return [...map.values()];
}

export function summarizeDrawings(rows: DashboardDrawing[], today: string) {
  const byStatus = emptyCounts();
  for (const d of rows) byStatus[d.status]++;
  const closed = rows.filter(d => isClosedStatus(d.status)).length;
  const soonLimit = addDays(today, DUE_SOON_DAYS);

  const overdue = rows
    .filter(d => isOverdueOn(d, today))
    .map(d => ({ ...d, daysLate: daysBetween(d.dueDate!, today) }))
    .sort((a, b) => b.daysLate - a.daysLate);
  const dueSoon = rows
    .filter(d => d.dueDate && !isClosedStatus(d.status) && d.dueDate >= today && d.dueDate <= soonLimit)
    .map(d => ({ ...d, daysLeft: daysBetween(today, d.dueDate!) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const reviewQueue = rows
    .filter(d => d.status === "need-approval")
    .map(d => ({ ...d, daysWaiting: d.needApprovalSince ? daysBetween(d.needApprovalSince, today) : 0 }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting);
  const overBudget = rows
    .filter(d => d.estimatedHours && d.loggedHours > d.estimatedHours)
    .map(d => ({ ...d, overBy: d.loggedHours - d.estimatedHours! }))
    .sort((a, b) => b.overBy - a.overBy);

  const byProject = group(rows, today, d => ({ key: d.projectId, label: d.projectCode, sublabel: d.projectName }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const byDiscipline = group(rows, today, d => ({ key: d.disciplineName ?? "", label: d.disciplineName ?? "No discipline" }))
    .sort((a, b) => b.total - a.total);
  const byOwner = group(rows, today, d => ({ key: d.ownerId ?? "", label: d.ownerName ?? "No owner" }))
    .sort((a, b) => (b.total - b.closed) - (a.total - a.closed));

  return {
    totals: {
      total: rows.length,
      closed,
      open: rows.length - closed,
      progressPct: rows.length ? Math.round((closed / rows.length) * 100) : 0,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      inReview: byStatus["need-approval"],
      awaitingApproval: byStatus["awaiting-approval"],
      openRemarks: rows.reduce((s, d) => s + d.openRemarks, 0),
      estimatedHours: rows.reduce((s, d) => s + (d.estimatedHours ?? 0), 0),
      loggedHours: rows.reduce((s, d) => s + d.loggedHours, 0),
    },
    byStatus,
    byProject,
    byDiscipline,
    byOwner,
    overdue,
    dueSoon,
    reviewQueue,
    overBudget,
  };
}

export type DrawingSummary = ReturnType<typeof summarizeDrawings>;
