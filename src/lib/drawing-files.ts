// Rules for a drawing revision's PDF. Shared by server actions, the download
// route and client components, so this module must stay free of server-only
// and DB imports.

import { DRAWING_STATUS_LABEL, formatDrawingRevision, type DrawingStatus } from "./drawing-status";

/**
 * The status from which a revision's PDF can be uploaded, sent and seen by
 * viewers. Admins pick it in Settings → Drawings.
 */
export const DRAWING_FILE_GATES = ["approved", "need-approval"] as const;
export type DrawingFileGate = (typeof DRAWING_FILE_GATES)[number];
export const DEFAULT_DRAWING_FILE_GATE: DrawingFileGate = "approved";

const GATE_STATUSES: Record<DrawingFileGate, ReadonlySet<DrawingStatus>> = {
  "approved": new Set(["approved-a", "approved-b", "as-built"]),
  "need-approval": new Set(["need-approval", "awaiting-approval", "approved-a", "approved-b", "as-built"]),
};

export const DRAWING_FILE_GATE_LABEL: Record<DrawingFileGate, { title: string; hint: string }> = {
  "approved": {
    title: "Approved by the client",
    hint: "Approved A, Approved B or As Built.",
  },
  "need-approval": {
    title: "Finished — from Need to be approved",
    hint: "Need to be approved, Awaiting approval, Approved A/B or As Built.",
  },
};

export function parseDrawingFileGate(value: unknown): DrawingFileGate {
  return DRAWING_FILE_GATES.includes(value as DrawingFileGate) ? (value as DrawingFileGate) : DEFAULT_DRAWING_FILE_GATE;
}

/** Whether a revision in this status may carry a PDF, send it and show it to viewers. */
export function isFileStatus(status: DrawingStatus, gate: DrawingFileGate): boolean {
  return GATE_STATUSES[gate].has(status);
}

/** "Approved A, Approved B or As Built" — for messages that say when uploads open. */
export function fileStatusList(gate: DrawingFileGate): string {
  const labels = [...GATE_STATUSES[gate]].map(s => DRAWING_STATUS_LABEL[s].replace(/ \(.*\)$/, ""));
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}` : labels[0];
}

export const DRAWING_FILE_TYPE = "application/pdf";
export const MAX_DRAWING_FILE_MB = 100;
export const MAX_DRAWING_FILE_BYTES = MAX_DRAWING_FILE_MB * 1024 * 1024;

export type FileUploadError = "NOT_LATEST" | "NOT_OWNER" | "STATUS";

export type FileUploadInput = {
  status: DrawingStatus;
  gate: DrawingFileGate;
  /** Older revisions are frozen; only the latest one takes a PDF. */
  isLatest: boolean;
  actorId: string;
  actorIsAdmin: boolean;
  ownerId: string | null;
};

/** Only the drawing owner or an admin uploads, to the latest revision, once its status allows it. */
export function checkFileUpload(i: FileUploadInput): { ok: true } | { ok: false; error: FileUploadError } {
  if (!i.isLatest) return { ok: false, error: "NOT_LATEST" };
  if (!i.actorIsAdmin && i.actorId !== i.ownerId) return { ok: false, error: "NOT_OWNER" };
  if (!isFileStatus(i.status, i.gate)) return { ok: false, error: "STATUS" };
  return { ok: true };
}

export function fileUploadErrorMessage(error: FileUploadError, gate: DrawingFileGate): string {
  switch (error) {
    case "NOT_LATEST":
      return "Only the latest revision takes a PDF — older revisions are locked.";
    case "NOT_OWNER":
      return "Only the drawing owner or an admin uploads the PDF.";
    case "STATUS":
      return `The PDF can be uploaded once the revision is ${fileStatusList(gate)}.`;
  }
}

export type FileTypeError = "NOT_PDF" | "TOO_LARGE" | "EMPTY";

/** Checks what the browser reports before anything is uploaded; the server re-checks the stored bytes. */
export function checkFileType(file: { name: string; type: string; size: number }): { ok: true } | { ok: false; error: FileTypeError } {
  const pdfName = /\.pdf$/i.test(file.name);
  if (!pdfName || (file.type && file.type !== DRAWING_FILE_TYPE)) return { ok: false, error: "NOT_PDF" };
  if (file.size <= 0) return { ok: false, error: "EMPTY" };
  if (file.size > MAX_DRAWING_FILE_BYTES) return { ok: false, error: "TOO_LARGE" };
  return { ok: true };
}

export const FILE_TYPE_ERROR_MESSAGE: Record<FileTypeError, string> = {
  NOT_PDF: "Only PDF files can be uploaded.",
  EMPTY: "The file is empty.",
  TOO_LARGE: `The PDF is larger than ${MAX_DRAWING_FILE_MB} MB.`,
};

/** A PDF starts with `%PDF-`; the spec lets some junk come first, so look at the first KB. */
export function looksLikePdf(head: Uint8Array): boolean {
  return new TextDecoder("latin1").decode(head.subarray(0, 1024)).includes("%PDF-");
}

/** Characters Windows and macOS refuse in file names. */
function fileNameSafe(s: string): string {
  return s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-").trim() || "drawing";
}

/** One folder in the bucket: plain ASCII so the layout reads the same in every S3 browser. */
function keySegment(s: string): string {
  return s.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "_";
}

/** The name people download, whatever the engineer called the file: `ELV-101_rev3.pdf`. */
export function drawingFileName(code: string, revisionNumber: number): string {
  return `${fileNameSafe(code)}_${formatDrawingRevision(revisionNumber)}.pdf`;
}

/**
 * Where the PDF lives in the bucket — `drawings/<project>/<drawing>/rev3/<drawing>_rev3_<id>.pdf`.
 * The id keeps every upload under its own key: Railway buckets have no
 * versioning, so nothing may ever be overwritten. Renaming a project or
 * drawing doesn't move files already stored; the database row is the record.
 */
export function drawingFileKey(i: { projectCode: string; drawingCode: string; revisionNumber: number; fileId: string }): string {
  const rev = formatDrawingRevision(i.revisionNumber);
  const drawing = keySegment(i.drawingCode);
  return `drawings/${keySegment(i.projectCode)}/${drawing}/${rev}/${drawing}_${rev}_${keySegment(i.fileId)}.pdf`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Where the app serves a drawing PDF; it checks access, then hands over a short-lived bucket link. */
export function drawingFileHref(fileId: string, download = false): string {
  return `/api/drawings/files/${fileId}${download ? "?download=1" : ""}`;
}
