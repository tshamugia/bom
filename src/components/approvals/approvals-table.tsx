import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";

type Row = {
  workflowId: string;
  projectCode: string;
  projectName: string;
  ownerName: string | null;
  revLetter: string | null;
  lineCount: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  age: string;
  latestExportId: string | null;
  latestExportFileName: string | null;
};

export function ApprovalsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>BOM</th>
              <th>Owner</th>
              <th>Rev</th>
              <th className="num">Lines</th>
              <th>Sent</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-3)" }}>
                  No BOMs have been sent yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.workflowId}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.projectName}</div>
                    <div className="mono muted" style={{ fontSize: 11 }}>{r.projectCode}</div>
                  </td>
                  <td>{r.ownerName ?? "—"}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{r.revLetter ? `Rev ${r.revLetter}` : "—"}</td>
                  <td className="num tabular">{r.lineCount}</td>
                  <td className="muted">{r.age} ago</td>
                  <td><Badge tone="success">Sent to procurement</Badge></td>
                  <td>
                    {r.latestExportId ? (
                      <a
                        href={`/api/exports/${r.latestExportId}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-icon btn-ghost"
                        title={r.latestExportFileName ?? "Download"}
                      >
                        <Icon.Download className="ico" />
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
