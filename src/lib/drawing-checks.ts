// Automatic DXF checks of a drawing revision (issue #18, stage 2): upload rules,
// run statuses and the pure step that turns a run's findings into Remarks.
// Shared by server actions, the callback route and client components, so this
// module must stay free of server-only and DB imports.

import type { DrawingStatus } from "./drawing-status";
import { CHECK_RULE_GROUPS, CHECK_RULE_IDS, checkRule, type CheckSeverity } from "./drawing-check-rules";

// ── Runs ───────────────────────────────────────────────────────────────────

/**
 * pending — the upload form was handed out; queued — the file is in the bucket
 * and the checker accepted it; done / failed — the checker called back.
 * held — checked, but the title block names another sheet than the drawing's,
 * so nothing changed until a person confirms the file (`drawing-check-link.ts`);
 * wrong-file — a person said the file wasn't this drawing's, and what the run
 * had changed was undone.
 */
export const CHECK_RUN_STATUSES = ["pending", "queued", "done", "failed", "held", "wrong-file"] as const;
export type CheckRunStatus = (typeof CHECK_RUN_STATUSES)[number];

export const CHECK_RUN_STATUS_LABEL: Record<CheckRunStatus, string> = {
  pending: "Uploading",
  queued: "Checking",
  done: "Checked",
  failed: "Failed",
  held: "Needs confirming",
  "wrong-file": "Wrong file",
};

/** A revision has at most one run in these statuses (partial unique index). */
export const ACTIVE_CHECK_STATUSES = ["pending", "queued"] as const satisfies readonly CheckRunStatus[];

/** The upload form is valid this long. */
export const CHECK_UPLOAD_EXPIRES_S = 10 * 60;
/** A pending run older than this was abandoned in the browser. */
export const PENDING_STALE_MS = 15 * 60 * 1000;
/** A queued run older than this lost its checker (restart, crash): it fails and frees the revision. */
export const QUEUED_STALE_MS = 60 * 60 * 1000;
/** The checker's download link has to outlive its queue, but not the run. */
export const CHECK_DOWNLOAD_TTL_S = QUEUED_STALE_MS / 1000;

/** Whether an active run has been waiting too long to still count. */
export function isCheckRunStale(
  run: { status: CheckRunStatus; createdAt: Date; startedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (run.status === "pending") return now.getTime() - run.createdAt.getTime() > PENDING_STALE_MS;
  if (run.status === "queued") return now.getTime() - (run.startedAt ?? run.createdAt).getTime() > QUEUED_STALE_MS;
  return false;
}

export const STALE_RUN_ERROR = "The checker didn't answer within an hour — upload the file again.";

// ── Upload rules ───────────────────────────────────────────────────────────

export const MAX_DXF_MB = 150;
export const MAX_DXF_BYTES = MAX_DXF_MB * 1024 * 1024;
/** Pinned by the upload form; DXF has no registered type and browsers report anything. */
export const DXF_CONTENT_TYPE = "application/dxf";

const SAVE_AS_DXF = "In AutoCAD use SAVEAS → AutoCAD 2018 DXF and upload that file.";

export type DxfFileError = "DWG" | "NOT_DXF" | "EMPTY" | "TOO_LARGE";

/** Checks what the browser reports before anything is uploaded; the server re-checks the stored bytes. */
export function checkDxfFile(file: { name: string; size: number }): { ok: true } | { ok: false; error: DxfFileError } {
  if (/\.dwg$/i.test(file.name)) return { ok: false, error: "DWG" };
  if (!/\.dxf$/i.test(file.name)) return { ok: false, error: "NOT_DXF" };
  if (file.size <= 0) return { ok: false, error: "EMPTY" };
  if (file.size > MAX_DXF_BYTES) return { ok: false, error: "TOO_LARGE" };
  return { ok: true };
}

export const DXF_FILE_ERROR_MESSAGE: Record<DxfFileError, string> = {
  DWG: `A DWG can't be checked. ${SAVE_AS_DXF}`,
  NOT_DXF: `Only DXF files can be checked. ${SAVE_AS_DXF}`,
  EMPTY: "The file is empty.",
  TOO_LARGE: `The DXF is larger than ${MAX_DXF_MB} MB.`,
};

/** What the first bytes of a stored file say it is — the same test the checker runs. */
export function sniffDxf(head: Uint8Array): "dxf" | "dxf-binary" | "dwg" | "unknown" {
  const text = new TextDecoder("latin1").decode(head.subarray(0, 64));
  if (text.startsWith("AutoCAD Binary DXF")) return "dxf-binary";
  if (/^AC\d{4}/.test(text)) return "dwg";
  const body = text.replace(/^ï»¿/, "").trimStart();
  if (body.startsWith("0") || body.startsWith("999")) return "dxf";
  return "unknown";
}

/** Why the stored bytes were refused, or null when they look like a DXF. */
export function storedDxfError(head: Uint8Array): string | null {
  const kind = sniffDxf(head);
  if (kind === "dwg") return `This file is a DWG renamed to .dxf. ${SAVE_AS_DXF}`;
  if (kind === "unknown") return `This file isn't a DXF. ${SAVE_AS_DXF}`;
  return null;
}

export type CheckUploadBlock = "DISABLED" | "NOT_CONFIGURED" | "NOT_LATEST" | "RUNNING";

/** Any editor checks the latest revision, in any status, while checks are on and nothing else runs on it. */
export function checkUploadBlock(i: {
  enabled: boolean;
  configured: boolean;
  isLatest: boolean;
  running: boolean;
}): CheckUploadBlock | null {
  if (!i.enabled) return "DISABLED";
  if (!i.configured) return "NOT_CONFIGURED";
  if (!i.isLatest) return "NOT_LATEST";
  if (i.running) return "RUNNING";
  return null;
}

export const CHECK_UPLOAD_BLOCK_MESSAGE: Record<CheckUploadBlock, string> = {
  DISABLED: "Automatic checks are turned off. An admin turns them on in Settings → Drawings.",
  NOT_CONFIGURED: "The checker isn't connected to this server yet — ask an admin.",
  NOT_LATEST: "Only the latest revision can be checked — older revisions are locked.",
  RUNNING: "A check of this revision is still running — wait for its result.",
};

/**
 * The checker reads the file's role from its folder; an upload has none, so the
 * drawing status stands in: still being drawn → `wip`, sent out → `issued`.
 */
export function checkFileRole(status: DrawingStatus): "wip" | "issued" {
  return status === "in-progress" || status === "paused" || status === "need-approval" ? "wip" : "issued";
}

// ── Configuration ──────────────────────────────────────────────────────────

function groupRules(id: string): string[] {
  return CHECK_RULE_GROUPS.find(g => g.id === id)?.rules.map(r => r.id) ?? [];
}

/**
 * What admins switch in Settings → DXF check settings; stored in
 * `drawing_check_config.rules`. A rule runs when it and its group are on, so
 * turning a group back on brings back the rules as they were. `severity` only
 * holds rules whose severity differs from the catalog's.
 */
export type CheckRulesConfig = { disabled: string[]; disabledGroups: string[]; severity: Record<string, CheckSeverity> };

const GROUP_IDS = new Set(CHECK_RULE_GROUPS.map(g => g.id));
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function parseCheckRulesConfig(value: unknown): CheckRulesConfig {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const disabled = [...new Set(strings(v.disabled).filter(id => checkRule(id)))];
  const disabledGroups = [...new Set(strings(v.disabledGroups).filter(id => GROUP_IDS.has(id)))];
  const severity: Record<string, CheckSeverity> = {};
  if (v.severity && typeof v.severity === "object") {
    for (const [k, s] of Object.entries(v.severity as Record<string, unknown>)) {
      const rule = checkRule(k);
      if (rule && (s === "ERROR" || s === "WARNING" || s === "INFO") && s !== rule.severity) severity[k] = s;
    }
  }
  return { disabled, disabledGroups, severity };
}

/** The file-name groups NAMING §1 lets a client's own naming replace — off on projects with the exception. */
export const CLIENT_NAMING_GROUPS = ["file-name", "name-codes", "name-revision"] as const;
export const CLIENT_NAMING_RULES: ReadonlySet<string> = new Set(CLIENT_NAMING_GROUPS.flatMap(groupRules));

/**
 * What applies to one drawing besides Settings: its project uses the client's
 * file naming, and the rules someone marked as a false error on it.
 */
export type CheckExceptions = { clientNaming: boolean; waived: readonly string[] };

export const NO_CHECK_EXCEPTIONS: CheckExceptions = { clientNaming: false, waived: [] };

/** Rules that never touch this drawing's Remarks, whatever the checker reports. */
export function suppressedCheckRules(e: CheckExceptions): Set<string> {
  return new Set([...(e.clientNaming ? CLIENT_NAMING_RULES : []), ...e.waived]);
}

/** Whether Settings has a rule on (the rule and its group). */
export function isCheckRuleOn(rules: CheckRulesConfig, ruleId: string): boolean {
  if (rules.disabled.includes(ruleId)) return false;
  const group = CHECK_RULE_GROUPS.find(g => g.rules.some(r => r.id === ruleId));
  return !!group && !rules.disabledGroups.includes(group.id);
}

/** The rules a check of this drawing runs: on in Settings, not excepted for the drawing. */
export function enabledCheckRules(rules: CheckRulesConfig, e: CheckExceptions = NO_CHECK_EXCEPTIONS): string[] {
  const suppressed = suppressedCheckRules(e);
  return CHECK_RULE_IDS.filter(id => isCheckRuleOn(rules, id) && !suppressed.has(id));
}

/** Kept on every run, so an old result always shows what it was checked against. */
export type CheckConfigSnapshot = {
  version: number;
  enabled: string[];
  severity: Record<string, CheckSeverity>;
  params: Record<string, unknown>;
  /** The project used the client's file naming (stage 3; older runs don't say). */
  clientNaming?: boolean;
  /** Rules marked as a false error on the drawing. */
  waived?: string[];
};

export function checkConfigSnapshot(
  cfg: { version: number; rules: CheckRulesConfig; params: Record<string, unknown> },
  e: CheckExceptions = NO_CHECK_EXCEPTIONS,
): CheckConfigSnapshot {
  const enabled = enabledCheckRules(cfg.rules, e);
  const on = new Set(enabled);
  return {
    version: cfg.version,
    enabled,
    severity: Object.fromEntries(Object.entries(cfg.rules.severity).filter(([id]) => on.has(id))),
    params: cfg.params,
    clientNaming: e.clientNaming,
    waived: [...e.waived].sort(),
  };
}

/** The body of `POST /v1/checks` (services/dxf-checker/README.md). */
export function checkRequestBody(i: {
  runId: string;
  fileUrl: string;
  fileName: string;
  sizeBytes: number;
  role: "wip" | "issued";
  config: CheckConfigSnapshot;
  callbackUrl: string;
}) {
  return {
    runId: i.runId,
    file: { url: i.fileUrl, name: i.fileName, sizeBytes: i.sizeBytes },
    context: { role: i.role },
    rules: { enabled: i.config.enabled, severity: i.config.severity, params: i.config.params },
    callbackUrl: i.callbackUrl,
  };
}

// ── Findings → Remarks ─────────────────────────────────────────────────────

export type CheckFinding = {
  rule: string;
  severity: CheckSeverity;
  group?: string | null;
  ref?: string;
  title?: string;
  message: string;
  recommendation?: string;
  evidence?: string;
};

export type CheckCounts = Record<CheckSeverity, number>;

/** A Remark holds this much text; the card lists every finding. */
export const CHECK_REMARK_MAX = 4000;

const SEVERITY_RANK: Record<CheckSeverity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };

/** ERROR and WARNING become Remarks (WARNING marked "to check" — some checks are heuristics); INFO stays in the report. */
export function isRemarkSeverity(s: CheckSeverity): boolean {
  return s === "ERROR" || s === "WARNING";
}

export const CHECK_SEVERITY_LABEL: Record<CheckSeverity, string> = {
  ERROR: "Error",
  WARNING: "To check",
  INFO: "Info",
};

/** Rules that compare against the parsed file name: they can't run when the name doesn't parse. */
const NEEDS_PARSED_NAME = new Set([
  ...groupRules("name-codes"),
  ...groupRules("name-revision"),
  "T-SHEET", "T-FILENAME", "T-REV", "T-PROJECT", "T-FLOOR", "T-REVTABLE",
]);
/** Rules that read the title block: they can't run when none was found. */
const NEEDS_TITLE_BLOCK = new Set(groupRules("title-block").filter(id => id !== "T-MISSING"));

/**
 * Enabled rules the checker couldn't evaluate in this file. Their open Remarks
 * stay as they are: "nothing reported" doesn't mean "fixed" for them.
 */
export function uncheckedRules(i: { nameParsed: boolean; titleBlockFound: boolean }): Set<string> {
  const out = new Set<string>();
  if (!i.nameParsed) NEEDS_PARSED_NAME.forEach(r => out.add(r));
  if (!i.titleBlockFound) NEEDS_TITLE_BLOCK.forEach(r => out.add(r));
  return out;
}

/** "+N სხვა" ("N more") — the Remark text is Georgian like the findings. */
const moreLine = (n: number) => `+${n} სხვა`;

/**
 * One Remark's text for one rule: title and standard reference, what was found,
 * how to fix it. A long list is cut with "+N სხვა" to fit `CHECK_REMARK_MAX`.
 */
export function checkRemarkBody(rule: string, findings: CheckFinding[], max = CHECK_REMARK_MAX): string {
  const known = checkRule(rule);
  const first = findings[0];
  const title = first?.title || known?.title || rule;
  const ref = first?.ref || known?.ref;
  const head = ref ? `${title} (${ref})` : title;

  const recs = [...new Set(findings.map(f => f.recommendation?.trim()).filter((r): r is string => !!r))];
  let tail = recs.map(r => `→ ${r}`).join("\n");
  if (tail.length > max / 4) tail = `${tail.slice(0, Math.floor(max / 4) - 1)}…`;

  const lines = findings.map(f => {
    const msg = `• ${f.message.trim()}`;
    const ev = f.evidence?.trim();
    return ev ? `${msg}\n  ${ev}` : msg;
  });

  // Room for the found lines once the title, the advice and a "+N სხვა" line are in.
  const reserve = head.length + (tail ? tail.length + 2 : 0) + 2 + moreLine(lines.length).length + 1;
  let budget = max - reserve;
  const shown: string[] = [];
  for (const line of lines) {
    const cost = line.length + 1;
    if (cost > budget) break;
    shown.push(line);
    budget -= cost;
  }
  if (shown.length === 0 && lines.length > 0) {
    // One finding longer than the whole Remark: show its start.
    shown.push(`${lines[0].slice(0, Math.max(0, budget - 2))}…`);
  }
  const hidden = lines.length - shown.length;
  const found = [...shown, ...(hidden > 0 ? [moreLine(hidden)] : [])].join("\n");
  return [head, found, tail].filter(Boolean).join("\n\n").slice(0, max);
}

export type OpenCheckRemark = { id: string; ruleId: string; body: string; severity: CheckSeverity | null };

export type RemarkPlan = {
  create: Array<{ ruleId: string; severity: CheckSeverity; body: string }>;
  update: Array<{ id: string; ruleId: string; severity: CheckSeverity; body: string }>;
  close: Array<{ id: string; ruleId: string }>;
  /** Open Remarks this run says nothing about: rule off, or not checkable in this file. */
  untouched: Array<{ id: string; ruleId: string }>;
};

/**
 * What a finished check does to the drawing's automatic Remarks — one Remark
 * per rule per drawing (issue #18, "ხელახალი შემოწმებისას"):
 *
 * - rule still broken, open Remark → its text and run are updated, nothing new;
 * - rule broken, no open Remark → a new one;
 * - rule enabled and passed, open Remark → it closes;
 * - rule off in this run, suppressed on this drawing (a false error, the
 *   project's client naming) or not checkable in this file → its open Remark stays.
 *
 * A rule is broken when it has an ERROR or WARNING finding. A rule reported
 * only as INFO (an admin may have lowered it) makes no Remark but hasn't
 * passed either, so its open Remark stays too. Findings of rules that weren't
 * enabled or are suppressed are ignored. A failed run never gets here — it
 * changes no Remark.
 */
export function planRemarkChanges(i: {
  findings: CheckFinding[];
  enabled: readonly string[];
  open: OpenCheckRemark[];
  unchecked?: ReadonlySet<string>;
  suppressed?: ReadonlySet<string>;
}): RemarkPlan {
  const suppressed = i.suppressed ?? new Set<string>();
  const enabled = new Set(i.enabled.filter(id => !suppressed.has(id)));
  const unchecked = new Set(i.unchecked ?? []);

  const broken = new Map<string, CheckFinding[]>();
  for (const f of i.findings) {
    if (!enabled.has(f.rule)) continue;
    if (!isRemarkSeverity(f.severity)) {
      unchecked.add(f.rule);
      continue;
    }
    const list = broken.get(f.rule) ?? [];
    list.push(f);
    broken.set(f.rule, list);
  }

  const openByRule = new Map(i.open.map(r => [r.ruleId, r]));
  const plan: RemarkPlan = { create: [], update: [], close: [], untouched: [] };

  for (const [ruleId, list] of [...broken].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...list].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    const severity = sorted[0].severity;
    const body = checkRemarkBody(ruleId, sorted);
    const open = openByRule.get(ruleId);
    if (open) plan.update.push({ id: open.id, ruleId, severity, body });
    else plan.create.push({ ruleId, severity, body });
  }

  for (const r of i.open) {
    if (broken.has(r.ruleId)) continue;
    if (enabled.has(r.ruleId) && !unchecked.has(r.ruleId)) plan.close.push({ id: r.id, ruleId: r.ruleId });
    else plan.untouched.push({ id: r.id, ruleId: r.ruleId });
  }
  return plan;
}

export function countFindings(findings: Pick<CheckFinding, "severity">[]): CheckCounts {
  const counts: CheckCounts = { ERROR: 0, WARNING: 0, INFO: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/** "3 errors, 2 to check, 1 info" — or "No findings". */
export function describeCounts(c: CheckCounts): string {
  const parts = [
    c.ERROR ? `${c.ERROR} error${c.ERROR === 1 ? "" : "s"}` : null,
    c.WARNING ? `${c.WARNING} to check` : null,
    c.INFO ? `${c.INFO} info` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "No findings";
}

/** "2 new, 1 updated, 3 closed" — what a run did to the Remarks; null when nothing changed. */
export function describeRemarkChanges(c: { created: number; updated: number; closed: number }): string | null {
  const parts = [
    c.created ? `${c.created} new` : null,
    c.updated ? `${c.updated} still open` : null,
    c.closed ? `${c.closed} closed` : null,
  ].filter(Boolean);
  return parts.length ? `Remarks: ${parts.join(", ")}` : null;
}

/** Findings for the card: errors first, then by rule. */
export function sortFindings<T extends Pick<CheckFinding, "severity" | "rule">>(findings: T[]): T[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.rule.localeCompare(b.rule));
}
