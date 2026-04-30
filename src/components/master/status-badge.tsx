type Tone = "success" | "info" | "warning" | "danger" | "gray";

const TONES: Record<Tone, string> = {
  success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  info:    "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  danger:  "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  gray:    "bg-[var(--color-surface-3)] text-[var(--color-text-2)]",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-medium ${TONES[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function VendorStatusBadge({ status }: { status: "preferred" | "approved" | "review" }) {
  const map = { preferred: ["success", "Preferred"], approved: ["info", "Approved"], review: ["warning", "Under review"] } as const;
  const [tone, label] = map[status];
  return <Badge tone={tone as Tone}>{label}</Badge>;
}

export function StockBadge({ state }: { state: "in-stock" | "low-stock" | "backorder" | "out-of-stock" }) {
  const map = {
    "in-stock":     ["success", "In stock"],
    "low-stock":    ["warning", "Low"],
    "backorder":    ["danger", "Backorder"],
    "out-of-stock": ["danger", "Out"],
  } as const;
  const [tone, label] = map[state];
  return <Badge tone={tone as Tone}>{label}</Badge>;
}
