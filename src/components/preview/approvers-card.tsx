import { Badge } from "@/components/ui/badge";

type Step = {
  position: number;
  role: string;
  status: "pending" | "active" | "approved" | "rejected" | "skipped";
  assigneeName: string | null;
};

export function ApproversCard({ steps }: { steps: Step[] | null }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-3">
        <h3 className="text-[13.5px] font-semibold">Approvers</h3>
      </div>
      <div className="py-1">
        {!steps || steps.length === 0 ? (
          <div className="px-4 py-4 text-[12.5px] text-[var(--color-text-3)]">Not yet sent for review.</div>
        ) : (
          steps.map(s => (
            <div key={s.position} className="flex items-center gap-2.5 px-4 py-2 text-[12.5px]">
              <div className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-accent)] text-[10px] font-semibold text-white">
                {(s.assigneeName ?? "?").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
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
