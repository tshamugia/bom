// Pure aggregation for the drawings dashboard and its Excel/PDF reports, so
// all three always show the same numbers. No server-only or DB imports.

import { DRAWING_STATUSES, isClosedStatus, type DrawingStatus } from "./drawing-status";
import { addDays, daysBetween } from "./drawing-reminders";
import { roundHours } from "./drawing-meta";

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
  revisionLabel: string;
  status: DrawingStatus;
  reviewerName: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  /** The drawing's own time entries — what its estimate is compared with. */
  loggedHours: number;
  /** Hours of the shared entries the drawing is in: shown apart, never added to `loggedHours`. */
  sharedHours: number;
  openRemarks: number;
  /** Tbilisi day the latest revision last asked for internal approval. */
  needApprovalSince: string | null;
};

/**
 * Hours logged once for several drawings of one project together (issue #17).
 * `drawingIds` are its live drawings; the entry counts while one of them is
 * on the list being summarised.
 */
export type SharedTimeEntry = { id: string; projectId: string; hours: number; drawingIds: string[] };

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
  /** Individual hours of the group's drawings, plus its shared entries once each (project groups only). */
  loggedHours: number;
  /** The shared part of `loggedHours`. Always 0 by discipline and by owner: shared time isn't split. */
  sharedHours: number;
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
      sharedHours: 0,
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

/**
 * The shared entries that count for these drawings, once each: those with at
 * least one drawing on the list. Each is booked to its own project — or, if a
 * drawing has since moved, to the project of one it still covers on the list.
 */
export function countedSharedTime(rows: DashboardDrawing[], shared: SharedTimeEntry[]) {
  const listed = new Map(rows.map(d => [d.id, d]));
  const seen = new Set<string>();
  const counted: Array<{ id: string; projectId: string; hours: number }> = [];
  for (const e of shared) {
    if (seen.has(e.id)) continue;
    const members = e.drawingIds.flatMap(id => listed.get(id) ?? []);
    if (members.length === 0) continue;
    seen.add(e.id);
    const home = members.find(m => m.projectId === e.projectId) ?? members[0];
    counted.push({ id: e.id, projectId: home.projectId, hours: e.hours });
  }
  return counted;
}

/**
 * Everything the dashboard and its reports show about these drawings. Shared
 * time is never added to a drawing's `loggedHours` or compared with its
 * estimate; the project groups and the totals add each shared entry once.
 */
export function summarizeDrawings(rows: DashboardDrawing[], today: string, shared: SharedTimeEntry[] = []) {
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
  const sharedTime = countedSharedTime(rows, shared);
  for (const e of sharedTime) {
    const g = byProject.find(p => p.key === e.projectId)!;
    g.sharedHours += e.hours;
    g.loggedHours += e.hours;
  }
  const individualHours = rows.reduce((s, d) => s + d.loggedHours, 0);
  const sharedHours = sharedTime.reduce((s, e) => s + e.hours, 0);
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
      /** Individual hours plus each shared entry once. */
      loggedHours: individualHours + sharedHours,
      /** The shared part of `loggedHours`. */
      sharedHours,
      /** How many shared entries that is. */
      sharedEntries: sharedTime.length,
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

/**
 * Said under the owner and discipline groupings while shared time exists:
 * their hours are each drawing's own, the shared ones are only in the project
 * and overall totals.
 */
export function sharedTimeFootnote(sharedHours: number, by: "owner" | "discipline"): string | undefined {
  if (sharedHours <= 0) return undefined;
  return `Each drawing's own hours. Shared time (${roundHours(sharedHours)} h) isn't split by ${by} — it counts once in the project and overall totals.`;
}

/** Said with a register that lists shared hours on every drawing they cover. */
export const SHARED_HOURS_COLUMN_NOTE =
  "Shared hours: time logged once for several drawings together. Each drawing lists it, but it isn't part of its logged hours, and the totals count it once — don't add up the column.";
