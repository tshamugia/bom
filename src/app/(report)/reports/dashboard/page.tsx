import type { Metadata } from "next";
import { requireSession } from "@/server/auth-context";
import { getDashboardData } from "@/server/queries/dashboard-report";
import { AutoPrint } from "@/components/drawings/auto-print";
import { DUE_SOON_DAYS, isOverdueOn, type GroupSummary } from "@/lib/drawing-dashboard";
import { DRAWING_STATUSES, DRAWING_STATUS_LABEL, formatDrawingRevision } from "@/lib/drawing-status";
import { formatDate, formatDateTime } from "@/lib/format";
import { roundHours } from "@/lib/drawing-meta";

export const metadata: Metadata = { title: "Dashboard report — BOM Studio" };

// Fixed light palette: this page is for paper/PDF, whatever theme the app is in.
const CSS = `
  html, body { background: #fff !important; color: #1c1f26; color-scheme: light !important; }
  .report { max-width: 1120px; margin: 0 auto; padding: 24px 28px 48px; font-size: 11.5px; line-height: 1.45; }
  .report h1 { font-size: 22px; margin: 0; letter-spacing: -0.02em; }
  .report h2 { font-size: 13.5px; margin: 22px 0 8px; }
  .report .meta { color: #6b7180; margin-top: 2px; }
  .report .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }
  .report .kpi { border: 1px solid #dfe2e8; border-radius: 6px; padding: 8px 10px; }
  .report .kpi .l { color: #6b7180; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
  .report .kpi .v { font-size: 18px; font-weight: 700; }
  .report table { width: 100%; border-collapse: collapse; }
  .report th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #4b5160;
    background: #f3f4f7; border-bottom: 1px solid #c9ced8; padding: 5px 7px; }
  .report td { border-bottom: 1px solid #eceef2; padding: 4px 7px; vertical-align: top; }
  .report .num { text-align: right; font-variant-numeric: tabular-nums; }
  .report .mono { font-family: var(--font-geist-mono), ui-monospace, monospace; }
  .report .late { color: #b91c1c; font-weight: 600; }
  .report .muted { color: #6b7180; }
  .report .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .report .empty { color: #6b7180; padding: 6px 7px; }
  .report-toolbar { position: sticky; top: 0; display: flex; gap: 12px; align-items: center; padding: 10px 28px;
    background: #f3f4f7; border-bottom: 1px solid #dfe2e8; font-size: 12.5px; color: #4b5160; }
  .report-toolbar a { color: inherit; }
  .report-toolbar button { background: #3a3fd9; color: #fff; border: 0; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
  @page { size: A4 landscape; margin: 12mm; }
  @media print {
    .report-toolbar { display: none; }
    .report { padding: 0; max-width: none; }
    .report tr, .report .kpi { break-inside: avoid; }
    .report .page-break { break-before: page; }
  }
`;

function GroupTable({ title, groups }: { title: string; groups: GroupSummary[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>{title}</th><th className="num">Drawings</th><th className="num">Open</th><th className="num">Approved</th>
          <th className="num">Overdue</th><th className="num">Open remarks</th><th className="num">Logged / est. h</th><th className="num">Approved %</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(g => (
          <tr key={g.key || "none"}>
            <td>{g.label}{g.sublabel && <span className="muted"> — {g.sublabel}</span>}</td>
            <td className="num">{g.total}</td>
            <td className="num">{g.total - g.closed}</td>
            <td className="num">{g.closed}</td>
            <td className={`num ${g.overdue ? "late" : ""}`}>{g.overdue}</td>
            <td className="num">{g.openRemarks}</td>
            <td className="num">{roundHours(g.loggedHours)} / {roundHours(g.estimatedHours)}</td>
            <td className="num">{g.total ? Math.round((g.closed / g.total) * 100) : 0}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function DashboardReportPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const dash = await getDashboardData(sp.project);
  const { today, project, summary: s, drawingData: data } = dash;
  const t = s.totals;
  const drawingsByProject = new Map(s.byProject.map(g => [g.key, g]));

  const kpis: Array<[string, string | number]> = [
    ["Projects", dash.projects.length],
    ["Active BOMs", dash.stats.activeBoms],
    ["Approvals pending", dash.stats.approvalsPending],
    ["Open deadlines", `${dash.deadlines.length} · ${dash.deadlines.filter(x => x.date < today).length} overdue`],
    ["Drawings", t.total],
    ["Approved", `${t.closed} · ${t.progressPct}%`],
    ["Overdue", t.overdue],
    ["Internal approval", t.inReview],
    ["Awaiting approval", t.awaitingApproval],
    ["Open remarks", t.openRemarks],
    ["Hours logged / est.", `${roundHours(t.loggedHours)} / ${roundHours(t.estimatedHours)}`],
    ["Outdated BOM links", data.outdatedBoms.length],
  ];
  const register = [...data.drawings].sort(
    (a, b) => a.projectCode.localeCompare(b.projectCode) || a.code.localeCompare(b.code),
  );

  return (
    <>
      <style>{CSS}</style>
      <AutoPrint backHref={project ? `/dashboard?project=${project.id}` : "/dashboard"} />
      <div className="report">
        <h1>Dashboard report</h1>
        <div className="meta">
          {project ? `${project.code} — ${project.name}` : "All projects"} · {formatDate(today)} ·
          generated by {session.user.name || session.user.email} at {formatDateTime(new Date())}
        </div>

        <div className="kpis">
          {kpis.map(([l, v]) => (
            <div key={l} className="kpi"><div className="l">{l}</div><div className="v">{v}</div></div>
          ))}
        </div>

        <h2>Projects &amp; BOMs</h2>
        {dash.projects.length === 0 ? <div className="empty">No projects.</div> : (
          <table>
            <thead>
              <tr>
                <th>Project</th><th>Client</th><th>Manager</th><th>Start</th><th>Completion</th>
                <th className="num">BOMs</th><th className="num">Lines</th><th>BOM rev</th><th className="num">Drawings</th><th className="num">Approved</th>
              </tr>
            </thead>
            <tbody>
              {dash.projects.map(p => {
                const g = drawingsByProject.get(p.id);
                return (
                  <tr key={p.id}>
                    <td><span className="mono">{p.code}</span> <span className="muted">{p.name}</span></td>
                    <td>{p.clientName ?? "—"}</td>
                    <td>{p.ownerName ?? "—"}</td>
                    <td>{p.startDate ? formatDate(p.startDate) : "—"}</td>
                    <td className={p.targetDate && p.targetDate < today ? "late" : undefined}>{p.targetDate ? formatDate(p.targetDate) : "—"}</td>
                    <td className="num">{p.bomCount}</td>
                    <td className="num">{p.lineCount}</td>
                    <td>{p.revLetter ? `Rev ${p.revLetter}` : "—"}</td>
                    <td className="num">{g?.total ?? 0}</td>
                    <td className="num">{g?.closed ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <h2>Deadlines ({dash.deadlines.length})</h2>
        {dash.deadlines.length === 0 ? <div className="empty">No open deadlines.</div> : (
          <table>
            <thead><tr><th>Date</th><th>Project</th><th>Deadline</th></tr></thead>
            <tbody>
              {dash.deadlines.map(x => (
                <tr key={x.key}>
                  <td className={x.date < today ? "late" : undefined}>{formatDate(x.date)}{x.date < today ? " · overdue" : ""}</td>
                  <td><span className="mono">{x.projectCode}</span> <span className="muted">{x.projectName}</span></td>
                  <td>{x.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="cols">
          <div>
            <h2>By status</h2>
            <table>
              <thead><tr><th>Status</th><th className="num">Drawings</th><th className="num">Share</th></tr></thead>
              <tbody>
                {DRAWING_STATUSES.map(st => (
                  <tr key={st}>
                    <td>{DRAWING_STATUS_LABEL[st]}</td>
                    <td className="num">{s.byStatus[st]}</td>
                    <td className="num">{t.total ? Math.round((s.byStatus[st] / t.total) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2>Waiting for internal approval</h2>
            {s.reviewQueue.length === 0 ? <div className="empty">None.</div> : (
              <table>
                <thead><tr><th>Drawing</th><th>Approving engineer</th><th className="num">Days</th></tr></thead>
                <tbody>
                  {s.reviewQueue.map(d => (
                    <tr key={d.id}>
                      <td><span className="mono">{d.projectCode} {d.code} {formatDrawingRevision(d.revisionNumber)}</span> <span className="muted">{d.name}</span></td>
                      <td>{d.reviewerName ?? "—"}</td>
                      <td className={`num ${d.daysWaiting >= 3 ? "late" : ""}`}>{d.daysWaiting}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {!project && (
          <>
            <h2>Drawings by project</h2>
            <GroupTable title="Project" groups={s.byProject} />
          </>
        )}

        <div className="cols">
          <div>
            <h2>Overdue ({s.overdue.length})</h2>
            {s.overdue.length === 0 ? <div className="empty">Nothing overdue.</div> : (
              <table>
                <thead><tr><th>Drawing</th><th>Owner</th><th>Due</th><th className="num">Days late</th></tr></thead>
                <tbody>
                  {s.overdue.map(d => (
                    <tr key={d.id}>
                      <td><span className="mono">{d.projectCode} {d.code}</span> <span className="muted">{d.name}</span></td>
                      <td>{d.ownerName ?? "—"}</td>
                      <td>{formatDate(d.dueDate!)}</td>
                      <td className="num late">{d.daysLate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h2>Due in the next {DUE_SOON_DAYS} days ({s.dueSoon.length})</h2>
            {s.dueSoon.length === 0 ? <div className="empty">Nothing due.</div> : (
              <table>
                <thead><tr><th>Drawing</th><th>Status</th><th>Due</th></tr></thead>
                <tbody>
                  {s.dueSoon.map(d => (
                    <tr key={d.id}>
                      <td><span className="mono">{d.projectCode} {d.code}</span> <span className="muted">{d.name}</span></td>
                      <td>{DRAWING_STATUS_LABEL[d.status]}</td>
                      <td>{formatDate(d.dueDate!)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <h2>Engineers</h2>
        <GroupTable title="Owner" groups={s.byOwner} />

        {data.outdatedBoms.length > 0 && (
          <>
            <h2>BOMs built from outdated drawings</h2>
            <table>
              <thead><tr><th>Project</th><th>BOM</th><th>Drawing</th><th>Built from</th><th>Current</th></tr></thead>
              <tbody>
                {data.outdatedBoms.map(b => (
                  <tr key={`${b.bomId}:${b.drawingId}`}>
                    <td className="mono">{b.projectCode}</td>
                    <td>{b.bomName} <span className="muted">Rev {b.bomRevisionLetter}</span></td>
                    <td className="mono">{b.code}</td>
                    <td className="mono late">{formatDrawingRevision(b.linkedNumber)}</td>
                    <td className="mono">{formatDrawingRevision(b.latestNumber)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2 className="page-break">Drawing register ({register.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Project</th><th>Code</th><th>Name</th><th>Discipline</th><th>Rev</th><th>Status</th>
              <th>Owner</th><th>Due</th><th className="num">Est. h</th><th className="num">Logged h</th><th className="num">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {register.map(d => (
              <tr key={d.id}>
                <td className="mono">{d.projectCode}</td>
                <td className="mono">{d.code}</td>
                <td>{d.name}</td>
                <td>{d.disciplineName ?? "—"}</td>
                <td className="mono">{formatDrawingRevision(d.revisionNumber)}</td>
                <td>{DRAWING_STATUS_LABEL[d.status]}</td>
                <td>{d.ownerName ?? "—"}</td>
                <td className={isOverdueOn(d, today) ? "late" : undefined}>{d.dueDate ? formatDate(d.dueDate) : "—"}</td>
                <td className="num">{d.estimatedHours ?? "—"}</td>
                <td className="num">{roundHours(d.loggedHours)}</td>
                <td className="num">{d.openRemarks || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
