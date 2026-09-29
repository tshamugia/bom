import Link from "next/link";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import type { Deadline } from "@/server/queries/dashboard";

/** Project completion dates and open milestones, overdue first. */
export function DeadlinesCard({
  deadlines,
  today,
  limit = 6,
  readOnly = false,
}: {
  deadlines: Deadline[];
  today: string;
  limit?: number;
  readOnly?: boolean;
}) {
  const shown = deadlines.slice(0, limit);
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Deadlines</h3>
        <span className="spacer" />
        {deadlines.length > limit && <span className="muted" style={{ fontSize: 12 }}>{deadlines.length - limit} more</span>}
      </div>
      <div style={{ padding: "4px 0" }}>
        {shown.length === 0 && (
          <div className="muted" style={{ padding: "12px 16px", fontSize: 12.5 }}>
            No dates set{readOnly ? "." : " — add them in the project passport."}
          </div>
        )}
        {shown.map((d, i) => {
          const overdue = d.date < today;
          return (
            <div
              key={d.key}
              style={{
                padding: "9px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 12.5,
                borderBottom: i < shown.length - 1 ? "1px solid var(--line-soft)" : "none",
              }}
            >
              <Icon.Calendar className="ico" style={{ color: overdue ? "var(--red)" : "var(--text-3)", flexShrink: 0 }} />
              <Link href={`/projects/${d.projectId}`} style={{ color: "inherit", flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  <span className="mono">{d.projectCode}</span> · {d.projectName}
                </div>
              </Link>
              <span
                className="tabular"
                style={{ textAlign: "right", whiteSpace: "nowrap", color: overdue ? "var(--red)" : "var(--text-3)", fontWeight: overdue ? 600 : undefined }}
              >
                {formatDate(d.date)}
                {overdue && <div style={{ fontSize: 11 }}>overdue</div>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
