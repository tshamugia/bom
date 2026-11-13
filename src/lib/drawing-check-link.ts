// Which drawing a DXF belongs to (issue #18, bulk upload and file-to-drawing
// linking): the drawing's sheet code, the standard file name, the plan the
// /drawings bulk upload previews and the server re-checks, and how a result's
// title block is compared with the drawing. Client-safe: no server or DB imports.

import { isProjectCode } from "./codes";
import { MAX_BULK_DRAWINGS } from "./drawing-bulk";
import { DXF_FILE_ERROR_MESSAGE, checkDxfFile } from "./drawing-checks";

// ── Sheet codes ────────────────────────────────────────────────────────────

/**
 * Zone, floor, system and number from the file name (NAMING §3–§5), e.g.
 * `ZZ-00-FA-102`. The same codes repeat across projects, so it is unique only
 * within a project.
 */
export const SHEET_CODE_RE = /^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z]{2}-\d{3}$/;

export const SHEET_CODE_EXAMPLE = "ZZ-00-FA-102";

export const SHEET_CODE_FORMAT_ERROR =
  `A sheet code is zone, floor, system and number from the file name, e.g. ${SHEET_CODE_EXAMPLE}.`;

/** What people type: spaces dropped, capitals. */
export function normalizeSheetCode(text: string): string {
  return text.replace(/\s+/g, "").toUpperCase();
}

export function isSheetCode(code: string): boolean {
  return SHEET_CODE_RE.test(code);
}

/** `ZZ-00-FA-102` → `FA-102`: the sheet number a title block carries (NAMING §10.1). */
export function sheetNumberOf(sheetCode: string): string {
  return sheetCode.split("-").slice(2).join("-");
}

export const sheetCodeTakenMessage = (sheetCode: string, drawingCode: string) =>
  `${sheetCode} is already the sheet code of ${drawingCode} in this project.`;

// ── File names ─────────────────────────────────────────────────────────────

/** `INS-26TGT-ZZ-00-FA-102_P01.dxf` (NAMING §3) — the same pattern the checker parses (`NAME_RE`). */
const FILE_NAME_RE =
  /^([A-Z]{3})-([A-Z0-9]{5})-([A-Z0-9]{2})-([A-Z0-9]{2})-([A-Z]{2})-(\d{3})(?:_([PC]\d{2}(?:\.\d{2})?))?$/;

export const STANDARD_FILE_NAME_EXAMPLE = "INS-26TGT-ZZ-00-FA-102_P01.dxf";

export type ParsedFileName = {
  originator: string;
  project: string;
  zone: string;
  floor: string;
  system: string;
  number: string;
  revision: string | null;
  /** `FA-102` */
  sheet: string;
  /** `ZZ-00-FA-102` */
  sheetCode: string;
};

/** The parts of a standard file name, or null when it doesn't follow the standard. */
export function parseDrawingFileName(fileName: string): ParsedFileName | null {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const m = FILE_NAME_RE.exec(stem);
  if (!m) return null;
  const [, originator, project, zone, floor, system, number, revision] = m;
  return {
    originator,
    project,
    zone,
    floor,
    system,
    number,
    revision: revision ?? null,
    sheet: `${system}-${number}`,
    sheetCode: `${zone}-${floor}-${system}-${number}`,
  };
}

// ── One file, one drawing ──────────────────────────────────────────────────

export type FileLink =
  | { ok: true; parsed: ParsedFileName | null; link: string | null }
  | { ok: false; error: "OTHER_PROJECT" | "OTHER_SHEET"; message: string };

/**
 * Whether a file may be checked on a drawing. A standard name must carry the
 * drawing's project code (projects with an old-style code like `BS-005` can't
 * be compared) and, once the drawing has a sheet code, exactly that code. A
 * drawing without one takes the file's — that is the first link by hand. A
 * name that doesn't follow the standard is the uploader's call.
 */
export function checkFileLink(i: { fileName: string; projectCode: string; sheetCode: string | null }): FileLink {
  const parsed = parseDrawingFileName(i.fileName);
  if (!parsed) return { ok: true, parsed: null, link: null };
  if (isProjectCode(i.projectCode) && parsed.project !== i.projectCode) {
    return {
      ok: false,
      error: "OTHER_PROJECT",
      message: `${i.fileName} is a file of project ${parsed.project}, but this drawing is in ${i.projectCode}.`,
    };
  }
  if (i.sheetCode && parsed.sheetCode !== i.sheetCode) {
    return {
      ok: false,
      error: "OTHER_SHEET",
      message: `${i.fileName} is sheet ${parsed.sheetCode}, but this drawing is ${i.sheetCode}. Upload its own file, or change its sheet code with Edit first.`,
    };
  }
  return { ok: true, parsed, link: i.sheetCode ? null : parsed.sheetCode };
}

// ── Bulk upload plan ───────────────────────────────────────────────────────

/** What the bulk upload needs to know about a selected drawing. */
export type BulkCheckDrawing = {
  id: string;
  code: string;
  projectId: string;
  projectCode: string;
  sheetCode: string | null;
};

export type BulkCheckFile = { key: string; name: string; size: number };

/**
 * ready — goes to `drawingId`; pick — someone has to say which drawing it is;
 * stopped — isn't uploaded, `reason` says why.
 */
export type BulkCheckState = "ready" | "pick" | "stopped";

export type BulkCheckItem = BulkCheckFile & {
  state: BulkCheckState;
  drawingId: string | null;
  /** `sheet` — the file's sheet code is the drawing's; `pick` — chosen by hand. */
  match: "sheet" | "pick" | null;
  /** The sheet code this upload gives the drawing (a first link by hand). */
  link: string | null;
  /** Parsed from a standard name. */
  sheetCode: string | null;
  /** Drawings the file may be linked to by hand; empty when its sheet code decides. */
  options: string[];
  reason: string | null;
};

export type BulkCheckPlan = {
  items: BulkCheckItem[];
  /** Selected drawings that can't take a bulk upload, and why. */
  blocked: Array<{ id: string; code: string; reason: string }>;
};

export const oldProjectCodeReason = (projectCode: string) =>
  `Project ${projectCode} still has an old-style code, so file names can't be compared with it — an admin changes the code in the project passport first.`;

const NAME_NOT_STANDARD =
  `The name doesn't follow the standard (${STANDARD_FILE_NAME_EXAMPLE}) — pick the drawing this file is.`;

/**
 * Which selected drawing each dropped DXF goes to, before anything is uploaded.
 * The dialog shows it and the server re-checks it with fresh rows, so both
 * stop the same files for the same reasons:
 *
 * - a standard name goes to the selected drawing of its project with that sheet
 *   code; with none, someone picks one of the project's selected drawings that
 *   has no sheet code yet, and it takes the file's;
 * - a name that doesn't follow the standard is always picked by hand;
 * - another project's file stops, and so do two files for one drawing (or of
 *   one sheet) — both, since only a person knows which is right;
 * - drawings of a project with an old-style code are left out.
 *
 * The server adds what only it knows: `takenBy` names an unselected drawing
 * of the project that already has the sheet code, `drawingBlock` says why a
 * drawing can't take a file now (a check of it is still running).
 */
export function planBulkCheck(i: {
  drawings: BulkCheckDrawing[];
  files: BulkCheckFile[];
  picks?: Readonly<Record<string, string>>;
  takenBy?: (projectId: string, sheetCode: string) => string | null;
  drawingBlock?: (drawingId: string) => string | null;
}): BulkCheckPlan {
  const picks = i.picks ?? {};
  const blocked = i.drawings
    .filter(d => !isProjectCode(d.projectCode))
    .map(d => ({ id: d.id, code: d.code, reason: oldProjectCodeReason(d.projectCode) }));
  const usable = i.drawings.filter(d => isProjectCode(d.projectCode));
  const byId = new Map(usable.map(d => [d.id, d]));
  const byProject = new Map<string, BulkCheckDrawing[]>();
  for (const d of usable) byProject.set(d.projectCode, [...(byProject.get(d.projectCode) ?? []), d]);

  const items: BulkCheckItem[] = i.files.map((f, index) => {
    const item: BulkCheckItem = {
      ...f, state: "stopped", drawingId: null, match: null, link: null, sheetCode: null, options: [], reason: null,
    };
    const stop = (reason: string) => ({ ...item, state: "stopped" as const, reason });
    const assign = (drawingId: string, match: "sheet" | "pick", link: string | null, options: string[] = []): BulkCheckItem => {
      const blockedNow = i.drawingBlock?.(drawingId);
      if (blockedNow) return { ...item, options, state: "stopped", reason: `${byId.get(drawingId)?.code}: ${blockedNow}` };
      return { ...item, options, state: "ready", drawingId, match, link, reason: null };
    };
    if (index >= MAX_BULK_DRAWINGS) return stop(`Only ${MAX_BULK_DRAWINGS} files can be checked at once.`);
    const file = checkDxfFile(f);
    if (!file.ok) return stop(DXF_FILE_ERROR_MESSAGE[file.error]);

    const pickFrom = (options: string[], link: string | null, why: string): BulkCheckItem => {
      const picked = picks[f.key];
      if (picked && options.includes(picked)) return assign(picked, "pick", link, options);
      return { ...item, options, state: "pick", reason: why };
    };

    const parsed = parseDrawingFileName(f.name);
    if (!parsed) {
      if (usable.length === 0) return stop("None of the selected drawings can take a bulk upload.");
      return pickFrom(usable.map(d => d.id), null, NAME_NOT_STANDARD);
    }
    item.sheetCode = parsed.sheetCode;
    const inProject = byProject.get(parsed.project) ?? [];
    if (inProject.length === 0) {
      return stop(`A file of project ${parsed.project} — none of the selected drawings is in that project.`);
    }
    const own = inProject.find(d => d.sheetCode === parsed.sheetCode);
    if (own) return assign(own.id, "sheet", null);
    const taken = i.takenBy?.(inProject[0].projectId, parsed.sheetCode);
    if (taken) return stop(`${parsed.sheetCode} is the sheet code of ${taken}, which isn't selected.`);
    const free = inProject.filter(d => !d.sheetCode).map(d => d.id);
    if (free.length === 0) {
      return stop(`No selected drawing of ${parsed.project} is sheet ${parsed.sheetCode}, and the others already have their own sheet codes.`);
    }
    return pickFrom(
      free,
      parsed.sheetCode,
      `No selected drawing is sheet ${parsed.sheetCode} yet — pick the drawing this file is; it keeps ${parsed.sheetCode} as its sheet code.`,
    );
  });

  // Two files for one drawing, or two files of one sheet: only a person knows which is right.
  const sheetKey = (it: BulkCheckItem) => {
    const p = parseDrawingFileName(it.name);
    return p ? `${p.project}/${p.sheetCode}` : null;
  };
  const perDrawing = new Map<string, number>();
  const perSheet = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const it of items) {
    if (it.state === "stopped") continue;
    if (it.state === "ready") bump(perDrawing, it.drawingId!);
    const s = sheetKey(it);
    if (s) bump(perSheet, s);
  }
  const unassigned = { state: "stopped" as const, drawingId: null, match: null, link: null };
  const plan = items.map(it => {
    if (it.state === "stopped") return it;
    const sheetFiles = perSheet.get(sheetKey(it) ?? "") ?? 0;
    if (sheetFiles > 1) {
      return { ...it, ...unassigned, reason: `${sheetFiles} files are sheet ${it.sheetCode} — remove the extra ones.` };
    }
    const drawingFiles = it.state === "ready" ? perDrawing.get(it.drawingId!) ?? 0 : 0;
    if (drawingFiles > 1) {
      const code = byId.get(it.drawingId!)?.code ?? "one drawing";
      return { ...it, ...unassigned, reason: `${drawingFiles} files go to ${code} — remove one, or pick another drawing.` };
    }
    return it;
  });
  return { items: plan, blocked };
}

// ── Title block ────────────────────────────────────────────────────────────

/**
 * What a finished check's title block says about the drawing it was linked to
 * (comment of 2026-11-10, "შტამპით გადამოწმება"): a renamed file passes by its
 * name but not by its title block.
 *
 * - match — Remarks are written and closed as usual;
 * - mismatch — nothing changes, the run waits for a person (`held`);
 * - unreadable — no title block or no sheet number: new Remarks are written,
 *   none closes automatically;
 * - unlinked — the drawing has no sheet code, in a project named by the
 *   standard: nothing tells this file apart from another drawing's, so new
 *   Remarks are written and none closes until the drawing has one;
 * - unset — the drawing has no sheet code in a project with the client's file
 *   naming (NAMING §1): Remarks are written and closed as usual, or they would
 *   never close there.
 */
export type SheetCheck = "match" | "mismatch" | "unreadable" | "unlinked" | "unset";

/** Whether a run with this verdict closes the Remarks its findings no longer report. */
export const sheetCheckCloses = (verdict: SheetCheck) => verdict === "match" || verdict === "unset";

/** The sheet number in a checker result's title block (`titleblock.values.sheet_no`), normalized. */
export function titleBlockSheetNo(titleblock: unknown): string | null {
  if (!titleblock || typeof titleblock !== "object") return null;
  const values = (titleblock as { values?: unknown }).values;
  if (!values || typeof values !== "object") return null;
  const raw = (values as Record<string, unknown>).sheet_no;
  if (typeof raw !== "string") return null;
  const v = normalizeSheetCode(raw);
  return v || null;
}

/**
 * A title block carries `FA-102` or the whole `ZZ-00-FA-102`; either matches.
 * `clientNaming` is the project's (NAMING §1), read when the result arrives.
 */
export function checkTitleBlockSheet(i: {
  sheetCode: string | null;
  titleblock: unknown;
  clientNaming: boolean;
}): { verdict: SheetCheck; found: string | null } {
  const found = titleBlockSheetNo(i.titleblock);
  if (!i.sheetCode) return { verdict: i.clientNaming ? "unset" : "unlinked", found };
  if (!found) return { verdict: "unreadable", found };
  const match = found === i.sheetCode || found === sheetNumberOf(i.sheetCode);
  return { verdict: match ? "match" : "mismatch", found };
}

/** One line for the card and the history about a title block that didn't settle it. */
export function sheetCheckNote(i: { verdict: SheetCheck | null; found: string | null; sheetCode: string | null }): string | null {
  if (i.verdict === "mismatch") {
    return `The title block says ${i.found}, but this drawing is ${i.sheetCode}. Nothing changed — confirm it is this drawing's file, or mark it as the wrong file.`;
  }
  if (i.verdict === "unreadable") {
    return "The title block's sheet number couldn't be read, so no remark was closed automatically.";
  }
  if (i.verdict === "unlinked") {
    return "This drawing has no sheet code, so no remark was closed automatically. Give it one with Edit, or check a DXF named by the standard.";
  }
  return null;
}

// ── Who decides ────────────────────────────────────────────────────────────

/**
 * NAMING §5 rule 4: a sheet is renumbered only before its first issue. Once
 * the drawing has a transmittal, only an admin changes or clears its sheet
 * code. Giving a sheet code to a drawing that has none stays open to every
 * editor: drawings issued before sheet codes existed get theirs that way.
 */
export function sheetCodeLocked(i: { current: string | null; issued: boolean; admin: boolean }): boolean {
  return i.current !== null && i.issued && !i.admin;
}

export const SHEET_CODE_LOCKED_ERROR =
  "This drawing has been issued, so only an admin can change its sheet code (NAMING §5).";

/** Confirming a held check, or marking a check as the wrong file: the uploader, the drawing's owner or an admin. */
export function canDecideCheckRun(i: { userId: string; admin: boolean; uploadedById: string | null; ownerId: string | null }): boolean {
  return i.admin || i.userId === i.uploadedById || i.userId === i.ownerId;
}

export const CHECK_DECIDE_ERROR =
  "Only whoever uploaded the file, the drawing's owner or an admin can confirm it or mark it as the wrong file.";

// ── Undoing a wrong file ───────────────────────────────────────────────────

/** "2 new remarks removed, 1 reopened, 3 restored" — or that nothing had changed. */
export function describeUndo(c: { removed: number; reopened: number; restored: number; kept: number }): string {
  const parts = [
    c.removed ? `${c.removed} new remark${c.removed === 1 ? "" : "s"} removed` : null,
    c.reopened ? `${c.reopened} closed remark${c.reopened === 1 ? "" : "s"} reopened` : null,
    c.restored ? `${c.restored} remark${c.restored === 1 ? "" : "s"} restored` : null,
    c.kept ? `${c.kept} left as they are (changed by hand since)` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing had changed";
}

/** The checker answers 503 while its queue is full; the bulk upload waits this long and tries again. */
export const CHECKER_BUSY_RETRY_MS = 30_000;
/** …and gives a file up after this long. Less than the pending run's life (`PENDING_STALE_MS`). */
export const CHECKER_BUSY_GIVE_UP_MS = 10 * 60 * 1000;
