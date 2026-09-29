import Link from "next/link";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/format";

type Row = {
  id: string;
  code: string;
  name: string;
  updatedAt: Date;
  targetDate: string | null;
  clientName: string | null;
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
      </div>
      {rows.length === 0 && (
        <div className="muted" style={{ padding: "20px 16px", fontSize: 12.5, textAlign: "center" }}>No projects yet.</div>
      )}
      <div className="table-wrap" style={rows.length ? undefined : { display: "none" }}>
        <table className="tbl tbl-list">
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
                <td className="l-title">
                  <Link href={`/projects/${p.id}`} style={{ display: "flex", alignItems: "center", gap: 10, color: "inherit" }}>
                    <Icon.Folder className="ico" />
                    <div>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        <span className="mono">{p.code}</span>{p.clientName && <> · {p.clientName}</>}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className={p.ownerName ? "l-meta" : "l-hide"}>{p.ownerName ?? "—"}</td>
                <td className="num tabular l-meta">{p.bomCount}<span className="min-[701px]:hidden"> BOM{p.bomCount === 1 ? "" : "s"}</span></td>
                <td className="num tabular l-hide">{p.lineCount}</td>
                <td className="muted l-hide">{p.revLetter ? `Rev ${p.revLetter}` : "—"}</td>
                <td className="muted l-meta">{relativeTime(p.updatedAt)}</td>
                <td className={`muted ${p.targetDate ? "l-meta" : "l-hide"}`} style={{ whiteSpace: "nowrap" }}>
                  {p.targetDate ? <><span className="min-[701px]:hidden">Due </span>{formatDate(p.targetDate)}</> : "—"}
                </td>
                <td className="l-aside">
                  <Link href={`/projects/${p.id}`} className="btn btn-icon btn-ghost" aria-label={`Open ${p.name}`}><Icon.Chevron className="ico" /></Link>
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
