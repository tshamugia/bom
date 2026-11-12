import Link from "next/link";
import { Icon } from "@/components/icons";
import { Badge, type Tone } from "@/components/ui/badge";
import { HelpTip } from "@/components/help/help-tip";
import { BlockedNote } from "@/components/help/blocked-note";
import { formatDateTime } from "@/lib/format";
import { formatFileSize } from "@/lib/drawing-files";
import type { CheckSeverity } from "@/lib/drawing-check-rules";
import {
  CHECK_RUN_STATUS_LABEL, CHECK_SEVERITY_LABEL, CHECK_UPLOAD_BLOCK_MESSAGE, checkUploadBlock, describeCounts,
  describeRemarkChanges, isCheckRunStale, sortFindings, type CheckFinding,
} from "@/lib/drawing-checks";
import type { DrawingCheckPanel, DrawingCheckRunRow } from "@/server/queries/drawing-checks";
import { canDecideCheckRun, normalizeSheetCode, sheetCheckNote } from "@/lib/drawing-check-link";
import { UploadDxfDialog } from "./upload-dxf-dialog";
import { CheckRefresher } from "./check-refresher";
import { CheckRunActions } from "./check-run-actions";
import { CheckWaivers } from "./check-waivers";

const SEVERITY_TONE: Record<CheckSeverity, Tone> = { ERROR: "danger", WARNING: "warning", INFO: "gray" };

const isActive = (r: DrawingCheckRunRow) => (r.status === "pending" || r.status === "queued") && !isCheckRunStale(r);

function statusTone(r: DrawingCheckRunRow): Tone {
  if (r.status === "failed") return "danger";
  if (r.status === "held") return "warning";
  if (r.status === "wrong-file") return "gray";
  if (r.status === "done") return r.counts?.ERROR ? "warning" : "success";
  return isActive(r) ? "info" : "gray";
}

/** What the title block said, when it didn't settle which drawing the file is. */
function sheetNote(run: DrawingCheckRunRow, sheetCode: string | null): string | null {
  // Once someone confirmed the file, "Confirmed as this drawing's file" says the rest.
  if (run.sheetCheck === "mismatch" && run.status !== "held") return null;
  const found = run.titleBlockSheet ? normalizeSheetCode(run.titleBlockSheet) : null;
  return sheetCheckNote({ verdict: run.sheetCheck, found, sheetCode });
}

/** "Checker 1.0.0 · NAMING 0.0.3 · DRAFTING 0.0.5 · settings v2" */
function engineLine(run: DrawingCheckRunRow, standards: Record<string, unknown> | null | undefined): string | null {
  const parts = [
    run.engineVersion ? `Checker ${run.engineVersion}` : null,
    ...Object.entries(standards ?? {}).map(([k, v]) => (typeof v === "string" ? `${k.toUpperCase()} ${v}` : null)),
    run.configVersion ? `settings v${run.configVersion}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** What the file name and the title block say the sheet is — so a wrong file is easy to spot. */
function sheetLine(details: NonNullable<DrawingCheckPanel["report"]>["details"]): string | null {
  if (!details) return null;
  const inName = str(details.parsedName?.sheetCode) ?? str(details.parsedName?.sheet);
  const values = details.titleblock?.values as Record<string, unknown> | undefined;
  const inBlock = str(values?.sheet_no);
  const name = inName ? `${inName} in the file name` : "the file name doesn't follow the standard";
  const block = details.titleblock ? (inBlock ? `${inBlock} in the title block` : "no sheet number in the title block") : "no title block found";
  return `Sheet: ${name}, ${block}.`;
}

function RunHeader({ run }: { run: DrawingCheckRunRow }) {
  const tone = run.status === "failed"
    ? "tone-red"
    : run.status === "held"
      ? "tone-amber"
      : run.status === "wrong-file"
        ? ""
        : run.status === "done" ? (run.counts?.ERROR ? "tone-amber" : "tone-green") : "tone-accent";
  const stale = (run.status === "pending" || run.status === "queued") && !isActive(run);
  return (
    <div className="flex items-start gap-3">
      <span className={`irow-ico ${tone}`}><Icon.Shield className="ico" /></span>
      <div className="min-w-0 flex-1">
        <div className="irow-title mono">{run.originalName}</div>
        <div className="irow-meta">
          <span className="mono">{run.revisionLabel}</span>
          <Badge tone={statusTone(run)}>{stale ? "Didn't finish" : CHECK_RUN_STATUS_LABEL[run.status]}</Badge>
          <span>{formatFileSize(run.sizeBytes)}</span>
          <span>{run.uploadedByName ?? "—"} · {formatDateTime(run.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

/** Who may confirm a held check or mark one as the wrong file, and whether the sheet code it linked stays. */
type Decider = { mayDecide: (run: DrawingCheckRunRow) => boolean; sheetCodeLocked: boolean };

function RunOutcome({
  run,
  sheetCode,
  undoable,
  decider,
}: {
  run: DrawingCheckRunRow;
  sheetCode: string | null;
  undoable: boolean;
  decider: Decider;
}) {
  if (isActive(run)) {
    return (
      <p className="muted m-0 text-[12.5px]">
        {run.status === "pending" ? "Uploading the file…" : "Checking… the result shows up here and on the Remarks card."}
      </p>
    );
  }
  if (run.status === "pending" || run.status === "queued") {
    return <p className="m-0 text-[12.5px]" style={{ color: "var(--red)" }}>This check didn&apos;t finish — upload the file again.</p>;
  }
  if (run.status === "failed") {
    return <p className="m-0 whitespace-pre-line text-[12.5px] [overflow-wrap:anywhere]" style={{ color: "var(--red)" }}>{run.error ?? "The check failed."}</p>;
  }
  if (run.status === "wrong-file") {
    return (
      <p className="muted m-0 text-[12.5px]">
        Marked as the wrong file{run.decidedByName ? ` by ${run.decidedByName}` : ""}{run.decidedAt ? ` · ${formatDateTime(run.decidedAt)}` : ""} — what its check changed was undone.
      </p>
    );
  }
  const counts = run.counts ?? { ERROR: 0, WARNING: 0, INFO: 0 };
  const note = sheetNote(run, sheetCode);
  const held = run.status === "held";
  const changes = run.remarkChanges;
  const remarks = changes?.skipped
    ? "Remarks unchanged — a newer revision was checked already."
    : changes
      ? describeRemarkChanges({ created: changes.created.length, updated: changes.updated.length, closed: changes.closed.length })
      : null;
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {counts.ERROR > 0 && <Badge tone="danger">{counts.ERROR} error{counts.ERROR === 1 ? "" : "s"}</Badge>}
        {counts.WARNING > 0 && <Badge tone="warning">{counts.WARNING} to check</Badge>}
        {counts.INFO > 0 && <Badge tone="gray">{counts.INFO} info</Badge>}
        {!counts.ERROR && !counts.WARNING && !counts.INFO && <Badge tone="success">No findings</Badge>}
      </div>
      {!held && remarks && <p className="m-0 text-[12.5px] text-[var(--color-text-2)]">{remarks}</p>}
      {note && (
        <p className="m-0 text-[12.5px] [overflow-wrap:anywhere]" style={held ? { color: "var(--amber)" } : undefined}>{note}</p>
      )}
      {!held && run.decidedByName && (
        <p className="muted m-0 text-[12px]">
          Confirmed as this drawing&apos;s file by {run.decidedByName}{run.decidedAt ? ` · ${formatDateTime(run.decidedAt)}` : ""}.
        </p>
      )}
      {(held || undoable) && (decider.mayDecide(run) ? (
        <CheckRunActions
          runId={run.id}
          fileName={run.originalName}
          held={held}
          linkedSheetCode={run.linkedSheetCode && run.linkedSheetCode === sheetCode ? run.linkedSheetCode : null}
          sheetCodeKept={decider.sheetCodeLocked}
        />
      ) : (
        <BlockedNote topic="drawing-check">
          {held ? "Confirming this file or marking it" : "Marking this file"} as the wrong file is up to{" "}
          {run.uploadedByName ?? "whoever uploaded it"}, the drawing&apos;s owner or an admin.
        </BlockedNote>
      ))}
    </div>
  );
}

function FindingItem({ f }: { f: CheckFinding }) {
  return (
    <li className="grid gap-1 px-4 py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[f.severity]}>{CHECK_SEVERITY_LABEL[f.severity]}</Badge>
        <span className="mono text-[11.5px]">{f.rule}</span>
        {f.ref && <span className="muted text-[11.5px]">{f.ref}</span>}
      </div>
      {f.title && <div className="text-[13px] font-medium [overflow-wrap:anywhere]">{f.title}</div>}
      <div className="whitespace-pre-line text-[12.5px] [overflow-wrap:anywhere]">{f.message}</div>
      {f.evidence && (
        <div className="mono muted whitespace-pre-line text-[11.5px] [overflow-wrap:anywhere]">{f.evidence}</div>
      )}
      {f.recommendation && (
        <div className="whitespace-pre-line text-[12.5px] text-[var(--color-text-2)] [overflow-wrap:anywhere]">→ {f.recommendation}</div>
      )}
    </li>
  );
}

/**
 * The automatic DXF check on the drawing page (issue #18): upload a DXF of the
 * latest revision, follow its status, read the latest result and every finding,
 * and see what this drawing skips (false errors, the project's client naming).
 * Editors only — viewers follow the Remarks it raises.
 */
export function DrawingCheckCard({
  panel,
  drawingCode,
  sheetCode,
  current,
  canManage = false,
  currentUserId,
  ownerId,
  sheetCodeLocked = false,
}: {
  panel: DrawingCheckPanel;
  drawingCode: string;
  /** The drawing's sheet code, which DXFs and their title blocks are held against. */
  sheetCode: string | null;
  current: { id: string; label: string };
  /** Admins remove false errors and reach the settings. */
  canManage?: boolean;
  currentUserId: string;
  /** The drawing's owner, who decides about held checks along with the uploader and admins. */
  ownerId: string | null;
  /** Issued and the user isn't an admin: "Wrong file" leaves the sheet code as it is. */
  sheetCodeLocked?: boolean;
}) {
  const decider: Decider = {
    mayDecide: r => canDecideCheckRun({ userId: currentUserId, admin: canManage, uploadedById: r.uploadedById, ownerId }),
    sheetCodeLocked,
  };
  const outcome = (r: DrawingCheckRunRow) => (
    <RunOutcome run={r} sheetCode={sheetCode} undoable={r.id === panel.undoableRunId} decider={decider} />
  );
  const [latest, ...earlier] = panel.runs;
  const running = panel.runs.some(r => r.revisionId === current.id && isActive(r));
  const block = checkUploadBlock({ enabled: panel.enabled, configured: panel.configured, isLatest: true, running });
  const report = panel.report;
  const findings = report ? sortFindings(report.findings) : [];
  const reportRun = report ? panel.runs.find(r => r.id === report.runId) : undefined;
  const checkedCurrent = panel.runs.some(r => r.revisionId === current.id && r.status === "done");

  return (
    <div id="dxf-check" className="card anchor-target mb-5">
      <div className="card-head">
        <div className="min-w-0">
          <h3 className="card-title flex items-center gap-1.5">Automatic DXF check <HelpTip topic="drawing-check" /></h3>
          <p className="card-sub">
            Checks a DXF of {current.label} against the naming and drafting standards and raises what it finds as remarks.
            {sheetCode
              ? <> DXFs must be sheet <span className="mono">{sheetCode}</span>. <HelpTip topic="drawing-sheet-code" /></>
              : null}
          </p>
        </div>
      </div>

      {latest && (
        <div className="grid gap-2 px-4 py-3">
          <RunHeader run={latest} />
          {outcome(latest)}
        </div>
      )}
      {!latest && panel.enabled && <p className="muted m-0 px-4 py-3 text-[12.5px]">No DXF has been checked for this drawing yet.</p>}

      <div className="grid gap-2 px-4 pb-3 empty:hidden">
        {!block && (
          <div>
            <UploadDxfDialog revisionId={current.id} revisionLabel={current.label} drawingCode={drawingCode} again={checkedCurrent} />
          </div>
        )}
        {block && block !== "RUNNING" && <BlockedNote topic="drawing-check">{CHECK_UPLOAD_BLOCK_MESSAGE[block]}</BlockedNote>}
        {panel.clientNaming && (
          <BlockedNote topic="drawing-check-settings">
            This project uses the client&apos;s file naming: the file name, its codes and its revision aren&apos;t checked.
          </BlockedNote>
        )}
        {canManage && (
          <Link href="/settings/drawing-checks" className="text-[12px] text-[var(--color-text-2)] hover:underline">
            Rules and parameters in Settings →
          </Link>
        )}
      </div>

      {report && reportRun && (
        <details style={{ borderTop: "1px solid var(--line-soft)" }}>
          <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] text-[var(--color-text-2)]">
            {findings.length ? `All findings (${findings.length})` : "Report"} — {reportRun.revisionLabel}, {describeCounts(reportRun.counts ?? { ERROR: 0, WARNING: 0, INFO: 0 })}
          </summary>
          <div className="grid gap-1 px-4 pb-2.5 text-[12px] text-[var(--color-text-3)]">
            {sheetLine(report.details) && <span>{sheetLine(report.details)}</span>}
            {engineLine(reportRun, report.details?.standards) && <span>{engineLine(reportRun, report.details?.standards)}</span>}
            {reportRun.sha256 && <span className="mono [overflow-wrap:anywhere]">SHA-256 {reportRun.sha256}</span>}
          </div>
          {findings.length > 0 && (
            <ul className="m-0 list-none p-0">
              {findings.map((f, i) => <FindingItem key={`${f.rule}-${i}`} f={f} />)}
            </ul>
          )}
        </details>
      )}

      {panel.waivers.length > 0 && (
        <details style={{ borderTop: "1px solid var(--line-soft)" }}>
          <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] text-[var(--color-text-2)]">
            False errors — not checked on this drawing ({panel.waivers.length})
          </summary>
          <CheckWaivers waivers={panel.waivers} canRemove={canManage} />
          {!canManage && (
            <div className="px-4 pb-2.5">
              <BlockedNote topic="drawing-check">Only an admin can have a rule checked here again.</BlockedNote>
            </div>
          )}
        </details>
      )}

      {earlier.length > 0 && (
        <details style={{ borderTop: "1px solid var(--line-soft)" }}>
          <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] text-[var(--color-text-2)]">
            Earlier checks ({earlier.length})
          </summary>
          {earlier.map(r => (
            <div key={r.id} className="grid gap-1.5 px-4 py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <RunHeader run={r} />
              {outcome(r)}
            </div>
          ))}
        </details>
      )}

      {panel.runs.some(isActive) && <CheckRefresher />}
    </div>
  );
}
