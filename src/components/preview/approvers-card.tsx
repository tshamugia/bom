import { Badge } from "@/components/ui/badge";

type Step = {
  position: number;
  role: string;
  status: "pending" | "active" | "approved" | "rejected" | "skipped";
  assigneeName: string | null;
};

export function ApproversCard({ steps }: { steps: Step[] | null }) {
  return (
    <div className="card">
      <div className="card-head"><h3 className="card-title">Approvers</h3></div>
      <div style={{ padding: "4px 0" }}>
        {!steps || steps.length === 0 ? (
          <div className="muted" style={{ padding: "12px 16px", fontSize: 12.5 }}>Not yet sent for review.</div>
        ) : (
          steps.map(s => (
            <div key={s.position} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", fontSize: 12.5 }}>
              <div className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
                {(s.assigneeName ?? "?").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div>{s.assigneeName ?? "Unassigned"}</div>
                <div className="text-[11px] text-[var(--color-text-3)]">{s.role}</div>
              </div>
              {s.status === "approved" && <Badge tone="success">Signed</Badge>}
              {s.status === "active"   && <Badge tone="warning">Reviewing</Badge>}
              {s.status === "pending"  && <Badge tone="gray">Pending</Badge>}
              {s.status === "rejected" && <Badge tone="danger">Rejected</Badge>}
              {s.status === "skipped"  && <Badge tone="gray">Skipped</Badge>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
