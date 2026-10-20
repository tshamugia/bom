// Pure rules for My work, the bell count and the dashboard's "Your work" strip:
// what needs the signed-in user, what is due and how updates read. No
// server-only or DB imports, so client components and unit tests can use it.

import { BOM_STATUS_LABEL, type RevisionStatus } from "./bom-status";
import { formatBomRevision } from "./bom-revision";
import { DRAWING_STATUS_LABEL, isClosedStatus, type DrawingStatus } from "./drawing-status";
import { REMARK_SOURCE_LABEL, TRANSMITTAL_PURPOSE_LABEL, type RemarkSource, type TransmittalPurpose } from "./drawing-meta";
import { addDays, daysBetween } from "./drawing-reminders";

/** Own drawings due within this many days are listed under Deadlines. */
export const MY_WORK_DUE_DAYS = 14;
/** Dates of projects the user manages show up this far ahead. */
export const MY_WORK_DATE_DAYS = 30;
/** Updates older than this drop off the list. */
export const MY_WORK_UPDATE_DAYS = 30;
/** Someone who never opened My work sees the last week's updates as new. */
export const MY_WORK_FIRST_VISIT_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/** A drawing the user owns, with its latest revision. */
export type MyDrawing = {
  id: string;
  code: string;
  name: string;
  projectCode: string;
  revisionNumber: number;
  status: DrawingStatus;
  dueDate: string | null;
  reviewerName: string | null;
  /** Tbilisi day the latest revision reached its current waiting status (approval only). */
  waitingSince: string | null;
};

/** A drawing revision the user was asked to approve as the second engineer. */
export type ApprovalTask = {
  drawingId: string;
  code: string;
  name: string;
  projectCode: string;
  revisionNumber: number;
  ownerName: string | null;
  /** Tbilisi day the approval was requested. */
  since: string | null;
};

/** Open remarks on a drawing the user owns. */
export type RemarkTask = {
  drawingId: string;
  code: string;
  name: string;
  projectCode: string;
  open: number;
  /** Tbilisi day the oldest open remark was raised. */
  oldestDay: string | null;
  latestBody: string | null;
};

/** One drawing reference that outdates a BOM. */
export type OutdatedRef = {
  bomId: string;
  bomName: string;
  projectId: string;
  projectCode: string;
  bomRevisionLetter: string;
  drawingId: string;
  code: string;
  linkedNumber: number;
  latestNumber: number;
};

/** A BOM the user owns whose current revision is built from older drawings. */
export type BomTask = {
  bomId: string;
  bomName: string;
  projectId: string;
  projectCode: string;
  revisionLetter: string;
  drawings: Array<{ drawingId: string; code: string; linkedNumber: number; latestNumber: number }>;
};

/** Completion date or open milestone of a project the user manages. */
export type ProjectDate = {
  key: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  label: string;
  date: string;
};

export type DeadlineItem =
  | { kind: "drawing"; key: string; date: string; drawing: MyDrawing }
  | { kind: "project"; key: string; date: string; project: ProjectDate };

export type WaitingItem = { drawing: MyDrawing; days: number | null; internal: boolean };

/** One BOM task per BOM, its outdated drawings in code order. */
export function groupBomTasks(refs: OutdatedRef[]): BomTask[] {
  const map = new Map<string, BomTask>();
  for (const r of refs) {
    const t = map.get(r.bomId) ?? {
      bomId: r.bomId,
      bomName: r.bomName,
      projectId: r.projectId,
      projectCode: r.projectCode,
      revisionLetter: r.bomRevisionLetter,
      drawings: [],
    };
    if (!t.drawings.some(d => d.drawingId === r.drawingId)) {
      t.drawings.push({ drawingId: r.drawingId, code: r.code, linkedNumber: r.linkedNumber, latestNumber: r.latestNumber });
    }
    map.set(r.bomId, t);
  }
  for (const t of map.values()) t.drawings.sort((a, b) => a.code.localeCompare(b.code));
  return [...map.values()].sort((a, b) => a.projectCode.localeCompare(b.projectCode) || a.bomName.localeCompare(b.bomName));
}

/**
 * Own drawings that are late or due within `MY_WORK_DUE_DAYS`, plus dates of
 * managed projects within `MY_WORK_DATE_DAYS` (late ones included), earliest first.
 */
export function collectDeadlines(drawings: MyDrawing[], projectDates: ProjectDate[], today: string): DeadlineItem[] {
  const drawingEnd = addDays(today, MY_WORK_DUE_DAYS);
  const dateEnd = addDays(today, MY_WORK_DATE_DAYS);
  return [
    ...drawings
      .filter(d => d.dueDate && !isClosedStatus(d.status) && d.dueDate <= drawingEnd)
      .map((d): DeadlineItem => ({ kind: "drawing", key: `d:${d.id}`, date: d.dueDate!, drawing: d })),
    ...projectDates
      .filter(p => p.date <= dateEnd)
      .map((p): DeadlineItem => ({ kind: "project", key: p.key, date: p.date, project: p })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

/** Own drawings waiting for someone else's approval, longest wait first. */
export function collectWaiting(drawings: MyDrawing[], today: string): WaitingItem[] {
  return drawings
    .filter(d => d.status === "need-approval" || d.status === "awaiting-approval")
    .map(d => ({
      drawing: d,
      days: d.waitingSince ? daysBetween(d.waitingSince, today) : null,
      internal: d.status === "need-approval",
    }))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
}

/** "3d late", "Today", "in 5d" — how a deadline reads next to its date. */
export function dueLabel(date: string, today: string): { text: string; tone: "red" | "amber" | "" } {
  if (date < today) return { text: `${daysBetween(date, today)}d late`, tone: "red" };
  const left = daysBetween(today, date);
  if (left === 0) return { text: "Today", tone: "amber" };
  return { text: `${left}d`, tone: left <= 2 ? "amber" : "" };
}

export type MyWorkCounts = {
  approvals: number;
  receipts: number;
  remarks: number;
  boms: number;
  /** Everything above: what waits for the user to act. */
  todo: number;
  /** Late own drawings and late dates of managed projects. */
  overdue: number;
  /** Not late yet, but on the Deadlines list. */
  dueSoon: number;
  /** Updates since the user last opened My work. */
  newUpdates: number;
};

export function countMyWork(i: {
  approvals: number;
  receipts: number;
  remarks: number;
  boms: number;
  deadlines: DeadlineItem[];
  newUpdates: number;
  today: string;
}): MyWorkCounts {
  const overdue = i.deadlines.filter(d => d.date < i.today).length;
  return {
    approvals: i.approvals,
    receipts: i.receipts,
    remarks: i.remarks,
    boms: i.boms,
    todo: i.approvals + i.receipts + i.remarks + i.boms,
    overdue,
    dueSoon: i.deadlines.length - overdue,
    newUpdates: i.newUpdates,
  };
}

/** The number on the bell: what needs the user plus what they haven't seen yet. */
export function bellCount(c: Pick<MyWorkCounts, "todo" | "overdue" | "newUpdates">): number {
  return c.todo + c.overdue + c.newUpdates;
}

/** Where "new" starts: the last visit, or a week back for someone who never came. */
export function updatesSince(seenAt: Date | null, now: Date = new Date()): Date {
  return seenAt ?? new Date(now.getTime() - MY_WORK_FIRST_VISIT_DAYS * MS_PER_DAY);
}

// ── Updates ────────────────────────────────────────────────────────────────

export type UpdateKind =
  | "comment"
  | "status"
  | "updated"
  | "created"
  | "file"
  | "remark"
  | "remark-resolved"
  | "transmittal"
  | "bom-status"
  | "bom-owner";

/** Raw rows the server collects; `describeUpdate` turns each into one readable line. */
export type RawUpdate = { id: string; at: Date; actorName: string | null; projectCode: string } & (
  | {
      source: "drawing-event";
      kind: "comment" | "status" | "updated" | "created" | "file";
      drawingId: string;
      code: string;
      name: string;
      revisionNumber: number;
      fromStatus: DrawingStatus | null;
      toStatus: DrawingStatus | null;
      body: string | null;
      /** The event's revision asks this user to approve it. */
      reviewerIsMe: boolean;
    }
  | {
      source: "remark";
      resolved: boolean;
      drawingId: string;
      code: string;
      name: string;
      revisionNumber: number;
      remarkSource: RemarkSource;
      body: string;
      resolution: string | null;
    }
  | {
      source: "transmittal";
      drawingId: string;
      code: string;
      name: string;
      revisionNumber: number;
      purpose: TransmittalPurpose;
      note: string | null;
    }
  | {
      source: "bom-status";
      bomId: string;
      projectId: string;
      bomName: string;
      revisionLetter: string;
      status: RevisionStatus;
      comment: string | null;
    }
  | {
      source: "bom-owner";
      bomId: string;
      projectId: string;
      bomName: string;
      revisionLetter: string;
    }
);

export type MyWorkUpdate = {
  id: string;
  kind: UpdateKind;
  at: Date;
  actorName: string;
  /** What it happened to: a drawing code + revision, or a BOM name + revision. */
  subject: string;
  subjectRev: string;
  verb: string;
  body: string | null;
  /** Project code and the drawing's name. */
  context: string;
  href: string;
};

const rev = (n: number) => `rev${n}`;

export function describeUpdate(u: RawUpdate): MyWorkUpdate {
  const base = { id: u.id, at: u.at, actorName: u.actorName ?? "Someone" };

  if (u.source === "drawing-event") {
    const common = {
      ...base,
      subject: u.code,
      subjectRev: rev(u.revisionNumber),
      context: `${u.projectCode} · ${u.name}`,
      href: `/drawings/${u.drawingId}#revisions`,
    };
    if (u.kind === "comment") return { ...common, kind: "comment", verb: "commented on", body: u.body };
    if (u.kind === "created") return { ...common, kind: "created", verb: "created", body: null };
    if (u.kind === "updated") return { ...common, kind: "updated", verb: "updated", body: u.body };
    if (u.kind === "file") return { ...common, kind: "file", verb: "changed the PDF of", body: u.body };

    const from = u.fromStatus ? DRAWING_STATUS_LABEL[u.fromStatus] : "—";
    const to = u.toStatus ? DRAWING_STATUS_LABEL[u.toStatus] : "—";
    const comment = u.body ? `“${u.body}”` : null;
    if (u.toStatus === "need-approval" && u.reviewerIsMe) {
      return { ...common, kind: "status", verb: "asked you to approve", body: comment, href: `/drawings/${u.drawingId}` };
    }
    if (u.fromStatus === "need-approval" && u.toStatus === "awaiting-approval") {
      return { ...common, kind: "status", verb: "approved", body: comment };
    }
    if (u.fromStatus === "need-approval" && u.toStatus === "in-progress" && u.body) {
      return { ...common, kind: "status", verb: "sent back", body: comment };
    }
    return { ...common, kind: "status", verb: "changed the status of", body: [`${from} → ${to}`, comment].filter(Boolean).join("\n") };
  }

  if (u.source === "remark") {
    const common = {
      ...base,
      subject: u.code,
      subjectRev: rev(u.revisionNumber),
      context: `${u.projectCode} · ${u.name}`,
      href: `/drawings/${u.drawingId}#remarks`,
    };
    if (u.resolved) {
      return { ...common, kind: "remark-resolved", verb: "resolved your remark on", body: u.resolution || `“${u.body}”` };
    }
    return { ...common, kind: "remark", verb: `raised a ${REMARK_SOURCE_LABEL[u.remarkSource].toLowerCase()} remark on`, body: u.body };
  }

  if (u.source === "transmittal") {
    return {
      ...base,
      kind: "transmittal",
      subject: u.code,
      subjectRev: rev(u.revisionNumber),
      verb: "issued you",
      body: [TRANSMITTAL_PURPOSE_LABEL[u.purpose], u.note ? `“${u.note}”` : null].filter(Boolean).join(" · "),
      context: `${u.projectCode} · ${u.name}`,
      href: `/drawings/${u.drawingId}`,
    };
  }

  const bom = {
    ...base,
    subject: u.bomName,
    subjectRev: formatBomRevision(u.revisionLetter),
    context: u.projectCode,
    href: `/builder/${u.projectId}/${u.bomId}`,
  };
  if (u.source === "bom-status") {
    return {
      ...bom,
      kind: "bom-status",
      verb: `set ${BOM_STATUS_LABEL[u.status]} on`,
      body: u.comment ? `“${u.comment}”` : null,
    };
  }
  return { ...bom, kind: "bom-owner", verb: "handed you", body: "You own the new revision now." };
}
