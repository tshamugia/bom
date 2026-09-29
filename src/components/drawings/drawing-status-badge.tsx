import { Badge, type Tone } from "@/components/ui/badge";
import { DRAWING_STATUS_LABEL, type DrawingStatus } from "@/lib/drawing-status";

const TONE: Record<DrawingStatus, Tone> = {
  "in-progress": "info",
  "paused": "gray",
  "need-approval": "warning",
  "awaiting-approval": "pink",
  "approved-a": "success",
  "approved-b": "teal",
  "as-built": "accent",
};

export function DrawingStatusBadge({ status }: { status: DrawingStatus }) {
  return <Badge tone={TONE[status]}>{DRAWING_STATUS_LABEL[status]}</Badge>;
}
