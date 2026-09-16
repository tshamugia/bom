type Tone = "success" | "info" | "warning" | "danger" | "accent" | "gray";

const TONE_CLASS: Record<Tone, string> = {
  success: "b-green",
  info: "b-blue",
  warning: "b-amber",
  danger: "b-red",
  accent: "b-purple",
  gray: "b-gray",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`badge ${TONE_CLASS[tone]}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

export function VendorStatusBadge({ status }: { status: "preferred" | "approved" | "review" }) {
  const map = { preferred: ["success", "Preferred"], approved: ["info", "Approved"], review: ["warning", "Under review"] } as const;
  const [tone, label] = map[status];
  return <Badge tone={tone as Tone}>{label}</Badge>;
}

type RevisionStatus = "draft" | "committed" | "in-progress" | "review" | "approved" | "locked";

const REVISION_STATUS_MAP: Record<RevisionStatus, { tone: Tone; label: string }> = {
  "draft":       { tone: "warning", label: "Draft" },
  "committed":   { tone: "info",    label: "Committed" },
  "in-progress": { tone: "info",    label: "In review" },
  "review":      { tone: "info",    label: "In review" },
  "approved":    { tone: "success", label: "Approved" },
  "locked":      { tone: "success", label: "Released" },
};

export function RevisionStatusBadge({ status }: { status: RevisionStatus }) {
  const { tone, label } = REVISION_STATUS_MAP[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export type { Tone };
