import Link from "next/link";
import { Badge, RevisionStatusBadge } from "@/components/ui/badge";
import { formatDrawingRevision } from "@/lib/drawing-status";
import type { BomLinkForDrawingRow } from "@/server/queries/drawing-control";

/** BOM revisions built from this drawing; only a BOM's current revision can be outdated. */
export function BomUsageCard({
  links,
  latestRevisionNumber,
  readOnly = false,
}: {
  links: BomLinkForDrawingRow[];
  latestRevisionNumber: number;
  /** Viewers can't open the builder, so BOMs link to the read-only preview instead. */
  readOnly?: boolean;
}) {
  const outdated = links.filter(l => l.isCurrentBomRevision && l.drawingRevisionNumber < latestRevisionNumber).length;

  return (
    <div className="card">
      <div className="card-head max-[701px]:flex-wrap">
        <div className="min-w-0">
          <h3 className="card-title">Used in BOMs</h3>
          <p className="card-sub">BOM revisions that were built from this drawing.</p>
        </div>
        <span className="spacer" />
        {outdated > 0 && <Badge tone="danger">{outdated} outdated</Badge>}
      </div>
      {links.length === 0 ? (
        <div className="muted px-4 py-3 text-[12.5px]">
          No BOM references this drawing yet.{!readOnly && " Link it from the BOM builder."}
        </div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 320 }}>
          <table className="tbl tbl-list">
            <thead>
              <tr>
                <th>BOM</th>
                <th>BOM rev</th>
                <th>Built from</th>
              </tr>
            </thead>
            <tbody>
              {links.map(l => {
                const stale = l.isCurrentBomRevision && l.drawingRevisionNumber < latestRevisionNumber;
                return (
                  <tr key={l.linkId} style={l.isCurrentBomRevision ? undefined : { opacity: 0.6 }}>
                    <td className="l-title">
                      <Link
                        href={`/${readOnly ? "preview" : "builder"}/${l.projectId}/${l.bomId}`}
                        style={{ color: "inherit", fontWeight: 500 }}
                      >
                        {l.bomName}
                      </Link>
                      {!l.isCurrentBomRevision && <div className="muted" style={{ fontSize: 11 }}>older revision</div>}
                    </td>
                    <td className="l-meta" style={{ whiteSpace: "nowrap" }}>
                      <span className="mono">Rev {l.bomRevisionLetter}</span>{" "}
                      <RevisionStatusBadge status={l.bomRevisionStatus} />
                    </td>
                    <td className="l-aside" style={{ whiteSpace: "nowrap" }}>
                      <span className="min-[701px]:hidden">Built from </span>
                      <span className="mono">{formatDrawingRevision(l.drawingRevisionNumber)}</span>
                      {stale && (
                        <div style={{ marginTop: 2 }}>
                          <Badge tone="danger">{formatDrawingRevision(latestRevisionNumber)} is newer</Badge>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
