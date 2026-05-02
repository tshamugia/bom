import { Badge } from "@/components/ui/badge";

export function ApprovalStatusBadge({ status, role }: { status: "pending" | "approved" | "rejected" | "cancelled"; role?: string | null }) {
  if (status === "approved")  return <Badge tone="success">Approved</Badge>;
  if (status === "rejected")  return <Badge tone="danger">Rejected</Badge>;
  if (status === "cancelled") return <Badge tone="gray">Cancelled</Badge>;
  return <Badge tone="info">{role ? `${role} review` : "In review"}</Badge>;
}
