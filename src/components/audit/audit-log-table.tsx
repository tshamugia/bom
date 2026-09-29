import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { kindMeta, refHref } from "@/components/history/activity-table";
import type { AuditLogRow } from "@/server/queries/audit";
import { formatDateTime } from "@/lib/format";

function hasDetails(r: AuditLogRow) {
  return (r.payload && Object.keys(r.payload).length > 0) || !!r.userAgent;
}

export function AuditLogTable({ rows }: { rows: AuditLogRow[] }) {
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Event</th>
              <th>Summary</th>
              <th>IP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-3)" }}>
                  <div style={{ fontSize: 13 }}>No events match these filters</div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>Pick another tab, clear filters or widen the date range.</div>
                </td>
              </tr>
            )}
            {rows.map(r => {
              const meta = kindMeta(r.kind);
              const href = refHref(r.refType, r.refId, r.payload);
              return (
                <tr key={r.id}>
                  <td className="muted" style={{ verticalAlign: "top", whiteSpace: "nowrap" }}>
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td style={{ verticalAlign: "top" }}>
                    {r.actorName ? (
                      <>
                        <div>{r.actorName}</div>
                        {r.actorEmail && <div className="muted" style={{ fontSize: 11.5 }}>{r.actorEmail}</div>}
                      </>
                    ) : (
                      <span className="muted">{r.kind.startsWith("auth.") || r.kind.startsWith("user.password") ? "anonymous" : "system"}</span>
                    )}
                  </td>
                  <td style={{ verticalAlign: "top" }}>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </td>
                  <td style={{ verticalAlign: "top", minWidth: 240 }}>
                    <div>{r.summary}</div>
                    {hasDetails(r) && (
                      <details style={{ marginTop: 4 }}>
                        <summary className="muted" style={{ cursor: "pointer", fontSize: 11.5 }}>Details</summary>
                        {r.payload && Object.keys(r.payload).length > 0 && (
                          <pre
                            className="mono"
                            style={{
                              marginTop: 6,
                              padding: 8,
                              fontSize: 11,
                              lineHeight: 1.45,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              background: "var(--color-surface-2)",
                              borderRadius: 6,
                            }}
                          >
                            {JSON.stringify(r.payload, null, 2)}
                          </pre>
                        )}
                        {r.userAgent && (
                          <div className="muted" style={{ marginTop: 4, fontSize: 11, wordBreak: "break-word" }}>
                            {r.userAgent}
                          </div>
                        )}
                      </details>
                    )}
                  </td>
                  <td className="mono muted" style={{ verticalAlign: "top", fontSize: 11.5, whiteSpace: "nowrap" }}>
                    {r.ip ?? "—"}
                  </td>
                  <td style={{ verticalAlign: "top", textAlign: "right" }}>
                    {href && (
                      r.refType === "export" ? (
                        <a href={href} target="_blank" rel="noopener noreferrer">Open</a>
                      ) : (
                        <Link href={href}>Open</Link>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
