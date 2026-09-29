import { DRAWING_STATUS_LABEL, type DrawingStatus } from "@/lib/drawing-status";

const STAGES: { label: string; statuses: DrawingStatus[] }[] = [
  { label: "In progress", statuses: ["in-progress", "paused"] },
  { label: "Internal check", statuses: ["need-approval"] },
  { label: "Awaiting approval", statuses: ["awaiting-approval"] },
  { label: "Approved", statuses: ["approved-a", "approved-b"] },
  { label: "As built", statuses: ["as-built"] },
];

function nextStep(status: DrawingStatus, owner: string | null, reviewer: string | null): string {
  switch (status) {
    case "in-progress": return owner ? `Being drawn by ${owner}.` : "Being drawn.";
    case "paused": return "Work on this drawing is paused.";
    case "need-approval": return reviewer ? `Waiting for ${reviewer} to check it internally.` : "Waiting for the internal check.";
    case "awaiting-approval": return "Checked internally — waiting for approval.";
    case "approved-a": return "Approved.";
    case "approved-b": return "Approved with comments.";
    case "as-built": return "Final as-built drawing.";
  }
}

/** Where the latest revision stands in the drawing lifecycle, and what happens next. */
export function DrawingPipeline({
  status,
  ownerName,
  reviewerName,
}: {
  status: DrawingStatus;
  ownerName: string | null;
  reviewerName: string | null;
}) {
  const current = STAGES.findIndex(s => s.statuses.includes(status));
  return (
    <div>
      <ol className="pipeline" aria-label={`Progress: ${DRAWING_STATUS_LABEL[status]}`}>
        {STAGES.map((s, i) => {
          const state = i < current ? "done" : i === current ? "now" : "";
          return (
            <li
              key={s.label}
              className={`pl-step ${state} ${i === current && status === "paused" ? "paused" : ""}`}
              aria-current={i === current ? "step" : undefined}
            >
              <span className="pl-bar" aria-hidden />
              <span className="pl-lab">{i === current && status === "paused" ? DRAWING_STATUS_LABEL.paused : s.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="muted" style={{ margin: 0, padding: "0 16px 14px", fontSize: 12.5 }}>
        {nextStep(status, ownerName, reviewerName)}
      </p>
    </div>
  );
}
