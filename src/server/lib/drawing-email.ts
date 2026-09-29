import {
  DRAWING_STATUS_LABEL,
  formatDrawingRevision,
  type DrawingStatus,
  type TransitionKind,
} from "@/lib/drawing-status";
import { TRANSMITTAL_PURPOSE_LABEL, type TransmittalPurpose } from "@/lib/drawing-meta";

/**
 * Owner and reviewer always hear about their drawing; the global and
 * per-project lists add everyone else who asked to follow. The person who made
 * the change already knows about it.
 */
export function pickDrawingRecipients(input: {
  globalUserIds: string[];
  projectUserIds: string[];
  ownerId: string | null;
  reviewerId: string | null;
  actorId: string;
}): string[] {
  const ids = new Set<string>([...input.globalUserIds, ...input.projectUserIds]);
  if (input.ownerId) ids.add(input.ownerId);
  if (input.reviewerId) ids.add(input.reviewerId);
  ids.delete(input.actorId);
  return [...ids];
}

export type DrawingStatusEmailInput = {
  appUrl: string;
  drawingId: string;
  projectCode: string;
  projectName: string;
  code: string;
  name: string;
  discipline: string | null;
  revisionNumber: number;
  from: DrawingStatus;
  to: DrawingStatus;
  kind: TransitionKind;
  actorName: string;
  ownerName: string | null;
  reviewerName: string | null;
  dueDate: string | null;
  commitMessage: string;
  comment: string | null;
};

function headline(i: DrawingStatusEmailInput): string {
  switch (i.kind) {
    case "request":
      return `${i.actorName} requested approval from ${i.reviewerName ?? "a second engineer"}.`;
    case "approve":
      return `${i.actorName} approved the internal check — the drawing is now awaiting approval.`;
    case "reject":
      return `${i.actorName} sent the drawing back for rework.`;
    default:
      return `${i.actorName} changed the drawing status.`;
  }
}

export function buildDrawingStatusEmail(i: DrawingStatusEmailInput): { subject: string; text: string } {
  const rev = formatDrawingRevision(i.revisionNumber);
  const from = DRAWING_STATUS_LABEL[i.from];
  const to = DRAWING_STATUS_LABEL[i.to];
  const url = `${i.appUrl.replace(/\/$/, "")}/drawings/${i.drawingId}`;

  const subject = `[${i.projectCode}] ${i.code} ${rev} — ${to}`;

  const facts: Array<[string, string | null]> = [
    ["Project", `${i.projectCode} — ${i.projectName}`],
    ["Drawing", `${i.code} — ${i.name}`],
    ["Discipline", i.discipline],
    ["Revision", rev],
    ["Status", `${from} → ${to}`],
    ["Owner", i.ownerName],
    ["Approver", i.reviewerName],
    ["Due date", i.dueDate],
  ];
  const width = Math.max(...facts.map(([k]) => k.length)) + 2;

  const lines = [
    headline(i),
    "",
    ...facts.filter(([, v]) => v).map(([k, v]) => `${`${k}:`.padEnd(width)}${v}`),
    "",
    "Revision note:",
    i.commitMessage,
  ];
  if (i.comment?.trim()) lines.push("", "Comment:", i.comment.trim());
  lines.push("", `Open the drawing: ${url}`);

  return { subject, text: lines.join("\n") };
}

export type TransmittalEmailInput = {
  appUrl: string;
  drawingId: string;
  projectCode: string;
  projectName: string;
  code: string;
  name: string;
  revisionNumber: number;
  status: DrawingStatus;
  purpose: TransmittalPurpose;
  senderName: string;
  recipientName: string;
  note: string | null;
};

export function buildTransmittalEmail(i: TransmittalEmailInput): { subject: string; text: string } {
  const rev = formatDrawingRevision(i.revisionNumber);
  const purpose = TRANSMITTAL_PURPOSE_LABEL[i.purpose];
  const url = `${i.appUrl.replace(/\/$/, "")}/drawings/${i.drawingId}`;

  const lines = [
    `Hi ${i.recipientName},`,
    "",
    `${i.senderName} issued ${i.code} ${rev} to you — ${purpose.toLowerCase()}.`,
    "",
    `Project:  ${i.projectCode} — ${i.projectName}`,
    `Drawing:  ${i.code} — ${i.name}`,
    `Revision: ${rev} (${DRAWING_STATUS_LABEL[i.status]})`,
    `Purpose:  ${purpose}`,
  ];
  if (i.note?.trim()) lines.push("", "Note:", i.note.trim());
  lines.push(
    "",
    `Open the drawing and acknowledge receipt: ${url}`,
    "If a newer revision is issued later, the drawing page shows it as superseded.",
  );

  return { subject: `[${i.projectCode}] ${i.code} ${rev} issued to you — ${purpose}`, text: lines.join("\n") };
}
