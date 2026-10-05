import { BOM_STATUS_LABEL, type RevisionStatus } from "@/lib/bom-status";

type Tone = "success" | "info" | "warning" | "danger" | "accent" | "gray" | "teal" | "pink";

const TONE_CLASS: Record<Tone, string> = {
  success: "b-green",
  info: "b-blue",
  warning: "b-amber",
  danger: "b-red",
  accent: "b-purple",
  gray: "b-gray",
  teal: "b-teal",
  pink: "b-pink",
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

const REVISION_STATUS_TONE: Record<RevisionStatus, Tone> = {
  "draft":       "warning",
  "committed":   "info",
  "in-progress": "gray",
  "review":      "accent",
  "approved":    "success",
  "locked":      "teal",
};

export function RevisionStatusBadge({ status }: { status: RevisionStatus }) {
  return <Badge tone={REVISION_STATUS_TONE[status]}>{BOM_STATUS_LABEL[status]}</Badge>;
}

export type { Tone };
