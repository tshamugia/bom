import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { formatDateTime } from "@/lib/format";

type Row = {
  id: string;
  fileName: string;
  generatedAt: Date;
  generatedByName: string | null;
  byteSize: number;
  status: "exported" | "archived" | "failed";
  projectCode: string;
  projectName: string;
  bomName?: string | null;
  revisionLetter: string;
};

export function HistoryTable({ rows }: { rows: Row[] }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Generated BOMs</h3>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>Last 90 days</span>
      </div>
      <div className="table-wrap">
        <table className="tbl tbl-list">
          <thead>
            <tr>
              <th>BOM</th>
              <th>Generated</th>
              <th>By</th>
              <th>File</th>
              <th className="num">Size</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-3)" }}>
                  <div style={{ fontSize: 13 }}>No exports yet</div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    Generate an Excel BOM from the Preview page to see it listed here.
                  </div>
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="l-title">
                  <div style={{ fontWeight: 500 }}>{r.bomName ?? r.projectName}</div>
                  <div className="mono muted" style={{ fontSize: 11 }}>{r.projectCode} · Rev. {r.revisionLetter}</div>
                </td>
                <td className="muted l-meta">{formatDateTime(r.generatedAt)}</td>
                <td className="l-meta">{r.generatedByName ?? "—"}</td>
                <td className="mono l-hide" style={{ fontSize: 11.5 }}>{r.fileName}</td>
                <td className="num tabular l-meta">{(r.byteSize / 1024).toFixed(1)} KB</td>
                <td className="l-aside">
                  {r.status === "exported" && <Badge tone="success">Exported</Badge>}
                  {r.status === "archived" && <Badge tone="gray">Archived</Badge>}
                  {r.status === "failed" && <Badge tone="danger">Failed</Badge>}
                </td>
                <td className="l-aside">
                  <div className="row-actions">
                    <a href={`/api/exports/${r.id}/download`} download className="btn btn-icon btn-ghost" title="Re-download">
                      <Icon.Download className="ico" />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
