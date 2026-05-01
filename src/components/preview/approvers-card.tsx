import { Badge } from "@/components/master/status-badge";

const STAGES = [
  { initials: "MC", name: "Marcus Chen",  role: "Engineering",  status: "done" },
  { initials: "SP", name: "Sarah Patel",  role: "Procurement",  status: "active" },
  { initials: "RH", name: "Ravi Hassan",  role: "Finance",      status: "pending" },
] as const;

export function ApproversCard() {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-3">
        <h3 className="text-[13.5px] font-semibold">Approvers</h3>
      </div>
      <div className="py-1">
        {STAGES.map(s => (
          <div key={s.name} className="flex items-center gap-2.5 px-4 py-2 text-[12.5px]">
            <div className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-accent)] text-[10px] font-semibold text-white">{s.initials}</div>
            <div className="flex-1">
              <div>{s.name}</div>
              <div className="text-[11px] text-[var(--color-text-3)]">{s.role}</div>
            </div>
            {s.status === "done"   && <Badge tone="success">Signed</Badge>}
            {s.status === "active" && <Badge tone="warning">Reviewing</Badge>}
            {s.status === "pending"&& <Badge tone="gray">Pending</Badge>}
          </div>
        ))}
      </div>
    </div>
  );
}
