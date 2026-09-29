import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatHours, roundHours } from "@/lib/drawing-meta";
import { DRAWING_STATUSES, DRAWING_STATUS_LABEL, formatDrawingRevision } from "@/lib/drawing-status";
import type { DrawingSummary, GroupSummary, StatusCounts } from "@/lib/drawing-dashboard";
import type { OutdatedBomReference } from "@/server/queries/drawing-dashboard";
import { Meter } from "@/components/dashboard/meter";
import { DrawingStatusBadge } from "./drawing-status-badge";

/** Drawings per status as a bar list — one hue, the value printed at each bar's end. */
export function StatusBars({ counts, total }: { counts: StatusCounts; total: number }) {
  const max = Math.max(1, ...DRAWING_STATUSES.map(s => counts[s]));
  return (
    <div className="grid gap-2.5 p-4">
      {DRAWING_STATUSES.map(s => {
        const n = counts[s];
        const share = total ? Math.round((n / total) * 100) : 0;
        return (
          <div
            key={s}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: "minmax(150px, 190px) 1fr 64px" }}
            title={`${DRAWING_STATUS_LABEL[s]}: ${n} drawing${n === 1 ? "" : "s"} (${share}%)`}
          >
            <div><DrawingStatusBadge status={s} /></div>
            <div style={{ height: 10, display: "flex", alignItems: "center" }}>
              {n > 0 && (
                <div
                  style={{
                    width: `${Math.max(2, (n / max) * 100)}%`,
                    height: 8,
                    borderRadius: "0 4px 4px 0",
                    background: "var(--accent)",
                  }}
                />
              )}
            </div>
            <div className="tabular text-right text-[12.5px]">
              <strong>{n}</strong> <span className="muted">{share}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="muted" style={{ textAlign: "center", padding: "18px 14px" }}>{text}</td>
    </tr>
  );
}

function DrawingCell({ d }: { d: { id: string; code: string; name: string; projectCode: string; revisionNumber: number } }) {
  return (
    <td>
      <Link href={`/drawings/${d.id}`} style={{ color: "inherit" }}>
        <span className="mono" style={{ fontWeight: 600 }}>{d.code}</span>{" "}
        <span className="mono muted">{formatDrawingRevision(d.revisionNumber)}</span>
        <div style={{ fontSize: 11.5 }} className="muted">{d.projectCode} · {d.name}</div>
      </Link>
    </td>
  );
}

export function ProjectTable({ groups, projectHref }: { groups: GroupSummary[]; projectHref: (id: string) => string }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Project</th>
            <th className="num">Drawings</th>
            <th className="num">In progress</th>
            <th className="num">Internal approval</th>
            <th className="num">Awaiting approval</th>
            <th className="num">Approved</th>
            <th className="num">Overdue</th>
            <th className="num">Open remarks</th>
            <th className="num">Hours</th>
            <th style={{ minWidth: 140 }}>Complete</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && <Empty cols={10} text="No drawings yet." />}
          {groups.map(g => {
            const pct = g.total ? Math.round((g.closed / g.total) * 100) : 0;
            return (
              <tr key={g.key}>
                <td>
                  <Link href={projectHref(g.key)} style={{ color: "inherit" }}>
                    <span className="mono" style={{ fontWeight: 600 }}>{g.label}</span>
                    {g.sublabel && <div className="muted" style={{ fontSize: 11.5 }}>{g.sublabel}</div>}
                  </Link>
                </td>
                <td className="num">{g.total}</td>
                <td className="num">{g.byStatus["in-progress"] + g.byStatus.paused}</td>
                <td className="num">{g.byStatus["need-approval"]}</td>
                <td className="num">{g.byStatus["awaiting-approval"]}</td>
                <td className="num">{g.closed}</td>
                <td className="num" style={g.overdue ? { color: "var(--red)", fontWeight: 600 } : undefined}>{g.overdue}</td>
                <td className="num">{g.openRemarks}</td>
                <td className="num" style={{ whiteSpace: "nowrap" }}>
                  {roundHours(g.loggedHours)}<span className="muted"> / {roundHours(g.estimatedHours)}</span>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div style={{ flex: 1 }}>
                      <Meter value={g.closed} max={g.total} label={`${g.label}: ${g.closed} of ${g.total} drawings approved (${pct}%)`} />
                    </div>
                    <span className="tabular text-[12px]">{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GroupTable({ groups, title }: { groups: GroupSummary[]; title: string }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>{title}</th>
            <th className="num">Open</th>
            <th className="num">Overdue</th>
            <th className="num">Approved</th>
            <th className="num">Logged / est. h</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && <Empty cols={5} text="Nothing to show." />}
          {groups.map(g => (
            <tr key={g.key || "none"}>
              <td>{g.label}</td>
              <td className="num">{g.total - g.closed}</td>
              <td className="num" style={g.overdue ? { color: "var(--red)", fontWeight: 600 } : undefined}>{g.overdue}</td>
              <td className="num">{g.closed}</td>
              <td
                className="num"
                style={{ whiteSpace: "nowrap", color: g.estimatedHours && g.loggedHours > g.estimatedHours ? "var(--red)" : undefined }}
              >
                {roundHours(g.loggedHours)} / {roundHours(g.estimatedHours)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OverdueTable({ rows }: { rows: DrawingSummary["overdue"] }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 360 }}>
      <table className="tbl">
        <thead>
          <tr><th>Drawing</th><th>Owner</th><th>Due</th><th className="num">Late</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <Empty cols={4} text="Nothing overdue." />}
          {rows.map(d => (
            <tr key={d.id}>
              <DrawingCell d={d} />
              <td>{d.ownerName ?? "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>{formatDate(d.dueDate!)}</td>
              <td className="num" style={{ color: "var(--red)", fontWeight: 600 }}>{d.daysLate}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DueSoonTable({ rows }: { rows: DrawingSummary["dueSoon"] }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 360 }}>
      <table className="tbl">
        <thead>
          <tr><th>Drawing</th><th>Status</th><th>Due</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <Empty cols={3} text="Nothing due this week." />}
          {rows.map(d => (
            <tr key={d.id}>
              <DrawingCell d={d} />
              <td><DrawingStatusBadge status={d.status} /></td>
              <td style={{ whiteSpace: "nowrap" }}>
                {formatDate(d.dueDate!)}
                <div className="muted" style={{ fontSize: 11 }}>{d.daysLeft === 0 ? "today" : `in ${d.daysLeft}d`}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReviewQueueTable({ rows }: { rows: DrawingSummary["reviewQueue"] }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 360 }}>
      <table className="tbl">
        <thead>
          <tr><th>Drawing</th><th>Approving engineer</th><th className="num">Waiting</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <Empty cols={3} text="No drawing is waiting for a second engineer." />}
          {rows.map(d => (
            <tr key={d.id}>
              <DrawingCell d={d} />
              <td>{d.reviewerName ?? "—"}</td>
              <td className="num" style={d.daysWaiting >= 3 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                {d.daysWaiting}d
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OverBudgetTable({ rows }: { rows: DrawingSummary["overBudget"] }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 360 }}>
      <table className="tbl">
        <thead>
          <tr><th>Drawing</th><th className="num">Estimated</th><th className="num">Logged</th><th className="num">Over</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <Empty cols={4} text="Every drawing is within its estimate." />}
          {rows.map(d => (
            <tr key={d.id}>
              <DrawingCell d={d} />
              <td className="num">{formatHours(d.estimatedHours)}</td>
              <td className="num">{formatHours(d.loggedHours)}</td>
              <td className="num" style={{ color: "var(--red)", fontWeight: 600 }}>
                +{Math.round((d.overBy / d.estimatedHours!) * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OutdatedBomTable({ rows }: { rows: OutdatedBomReference[] }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 360 }}>
      <table className="tbl">
        <thead>
          <tr><th>BOM</th><th>Drawing</th><th>Built from</th><th>Current</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <Empty cols={4} text="Every BOM uses the latest drawing revisions." />}
          {rows.map(r => (
            <tr key={`${r.bomId}:${r.drawingId}`}>
              <td>
                <Link href={`/builder/${r.projectId}/${r.bomId}`} style={{ color: "inherit", fontWeight: 500 }}>{r.bomName}</Link>
                <div className="muted" style={{ fontSize: 11.5 }}>{r.projectCode} · Rev {r.bomRevisionLetter}</div>
              </td>
              <td className="mono"><Link href={`/drawings/${r.drawingId}`} style={{ color: "inherit" }}>{r.code}</Link></td>
              <td className="mono" style={{ color: "var(--red)" }}>{formatDrawingRevision(r.linkedNumber)}</td>
              <td className="mono">{formatDrawingRevision(r.latestNumber)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
