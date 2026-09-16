import Link from "next/link";
import { Icon } from "@/components/icons";

type Row = {
  id: string;
  code: string;
  name: string;
  updatedAt: Date;
  targetDate: string | null;
  ownerName: string | null;
  revLetter: string | null;
  bomCount: number;
  lineCount: number;
};

export function ProjectsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Projects</h3>
        <span className="muted" style={{ fontSize: 12 }}>{rows.length} active</span>
        <div className="spacer" />
        <div className="pill">All teams <Icon.ChevDown className="ico" /></div>
        <div className="pill">All status <Icon.ChevDown className="ico" /></div>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Project</th>
              <th>Owner</th>
              <th className="num">BOMs</th>
              <th className="num">Lines</th>
              <th>Rev</th>
              <th>Updated</th>
              <th>Target</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} style={{ cursor: "pointer" }}>
                <td>
                  <Link href={`/projects/${p.id}`} style={{ display: "flex", alignItems: "center", gap: 10, color: "inherit" }}>
                    <Icon.Folder className="ico" />
                    <div>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{p.code}</div>
                    </div>
                  </Link>
                </td>
                <td>{p.ownerName ?? "—"}</td>
                <td className="num tabular">{p.bomCount}</td>
                <td className="num tabular">{p.lineCount}</td>
                <td className="muted">{p.revLetter ? `Rev ${p.revLetter}` : "—"}</td>
                <td className="muted">{relativeTime(p.updatedAt)}</td>
                <td className="muted">{p.targetDate ?? "—"}</td>
                <td>
                  <Link href={`/projects/${p.id}`} className="btn btn-icon btn-ghost"><Icon.Chevron className="ico" /></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function relativeTime(d: Date | string) {
  const ms = Date.now() - new Date(d).getTime();
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "1d ago" : days < 14 ? `${days}d ago` : `${Math.round(days / 7)}w ago`;
}
