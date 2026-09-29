import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatDrawingRevision, isDrawingOverdue, type DrawingStatus } from "@/lib/drawing-status";
import { formatHours, roundHours } from "@/lib/drawing-meta";
import { DrawingStatusBadge } from "./drawing-status-badge";

export type DrawingTableRow = {
  id: string;
  code: string;
  name: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  disciplineName: string | null;
  ownerName: string | null;
  revisionNumber: number;
  status: DrawingStatus;
  reviewerName: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  loggedHours: number;
  openRemarks: number;
  updatedAt: Date;
  lastModifiedByName: string | null;
};

export function DrawingsTable({
  rows,
  today,
  showProject = true,
  emptyText = "No drawings match these filters.",
}: {
  rows: DrawingTableRow[];
  today: string;
  showProject?: boolean;
  emptyText?: string;
}) {
  const cols = showProject ? 10 : 9;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            {showProject && <th>Project</th>}
            <th>Discipline</th>
            <th>Rev</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Due</th>
            <th className="num">Hours</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols} className="muted" style={{ textAlign: "center", padding: "28px 14px" }}>
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map(r => {
            const overdue = isDrawingOverdue(r.dueDate, r.status, today);
            return (
              <tr key={r.id}>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>
                  <Link href={`/drawings/${r.id}`} style={{ color: "inherit", fontWeight: 600 }}>{r.code}</Link>
                </td>
                <td>
                  <Link href={`/drawings/${r.id}`} style={{ color: "inherit", fontWeight: 500 }}>{r.name}</Link>
                  {r.openRemarks > 0 && (
                    <div style={{ fontSize: 11, color: "var(--amber)", fontWeight: 600 }}>
                      {r.openRemarks} open remark{r.openRemarks === 1 ? "" : "s"}
                    </div>
                  )}
                </td>
                {showProject && (
                  <td>
                    <Link href={`/projects/${r.projectId}`} className="mono" style={{ fontSize: 11.5, color: "var(--text-2)" }} title={r.projectName}>
                      {r.projectCode}
                    </Link>
                  </td>
                )}
                <td className="muted">{r.disciplineName ?? "—"}</td>
                <td className="mono muted">{formatDrawingRevision(r.revisionNumber)}</td>
                <td>
                  <DrawingStatusBadge status={r.status} />
                  {r.status === "need-approval" && r.reviewerName && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>by {r.reviewerName}</div>
                  )}
                </td>
                <td>{r.ownerName ?? "—"}</td>
                <td style={{ whiteSpace: "nowrap", color: overdue ? "var(--red)" : undefined, fontWeight: overdue ? 600 : undefined }}>
                  {r.dueDate ? formatDate(r.dueDate) : <span className="muted">—</span>}
                  {overdue && <div style={{ fontSize: 11 }}>overdue</div>}
                </td>
                <td
                  className="num"
                  style={{ whiteSpace: "nowrap", color: r.estimatedHours && r.loggedHours > r.estimatedHours ? "var(--red)" : undefined }}
                  title={r.estimatedHours ? `${formatHours(r.loggedHours)} logged of ${formatHours(r.estimatedHours)} estimated` : undefined}
                >
                  {r.loggedHours || r.estimatedHours ? (
                    <>
                      {roundHours(r.loggedHours)}
                      <span className="muted"> / {r.estimatedHours ? roundHours(r.estimatedHours) : "—"}</span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>
                  <div>{formatDateTime(r.updatedAt)}</div>
                  {r.lastModifiedByName && <div style={{ fontSize: 11 }}>{r.lastModifiedByName}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
