import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/badge";
import type { ActivityRow, AuditKind } from "@/server/queries/audit";

const KIND_META: Record<AuditKind, { label: string; tone: Tone; group: string }> = {
  "bom.created":            { label: "Created",           tone: "info",    group: "Project / BOM" },
  "bom.renamed":            { label: "BOM renamed",       tone: "gray",    group: "Project / BOM" },
  "bom.deleted":            { label: "BOM archived",      tone: "warning", group: "Project / BOM" },
  "bom.duplicated":         { label: "BOM duplicated",    tone: "info",    group: "Project / BOM" },
  "project.deleted":        { label: "Project archived",  tone: "warning", group: "Project / BOM" },
  "project.restored":       { label: "Project restored",  tone: "info",    group: "Project / BOM" },
  "bom.line.added":         { label: "Line added",        tone: "info",    group: "BOM" },
  "bom.line.moved":         { label: "Line moved",        tone: "gray",    group: "BOM" },
  "bom.line.qty.updated":   { label: "Line qty changed",  tone: "gray",    group: "BOM" },
  "bom.line.removed":       { label: "Line removed",      tone: "warning", group: "BOM" },
  "bom.section.created":    { label: "Section added",     tone: "info",    group: "BOM" },
  "bom.section.renamed":    { label: "Section renamed",   tone: "gray",    group: "BOM" },
  "bom.section.reordered":  { label: "Section reordered", tone: "gray",    group: "BOM" },
  "bom.section.deleted":    { label: "Section removed",   tone: "warning", group: "BOM" },
  "bom.revision.committed": { label: "Revision committed", tone: "success", group: "Revision" },
  "bom.revision.branched":  { label: "Revision branched", tone: "info",    group: "Revision" },
  "bom.revision.discarded": { label: "Revision discarded", tone: "danger", group: "Revision" },
  "bom.export.generated":   { label: "BOM exported",      tone: "accent",  group: "Export" },
  "procurement.email.sent": { label: "BOM emailed to procurement", tone: "accent", group: "Export" },
  "catalog.imported":       { label: "Catalog imported",  tone: "info",    group: "Catalog" },
  "catalog.exported":       { label: "Catalog exported",  tone: "accent",  group: "Catalog" },
  "vendors.exported":       { label: "Vendors exported",  tone: "accent",  group: "Catalog" },
  "approval.requested":     { label: "Approval requested", tone: "info",    group: "Approval" },
  "approval.approved":      { label: "Approved",          tone: "success", group: "Approval" },
  "approval.rejected":      { label: "Rejected",          tone: "danger",  group: "Approval" },
  "vendor.created":         { label: "Vendor added",      tone: "info",    group: "Master" },
  "item.created":           { label: "Item added",        tone: "info",    group: "Master" },
  "user.created":           { label: "User invited",      tone: "info",    group: "Users" },
  "user.disabled":          { label: "User disabled",     tone: "warning", group: "Users" },
};

export const KIND_GROUPS: Array<{ group: string; kinds: AuditKind[] }> = (() => {
  const groups = new Map<string, AuditKind[]>();
  for (const k of Object.keys(KIND_META) as AuditKind[]) {
    const g = KIND_META[k].group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(k);
  }
  return [...groups.entries()].map(([group, kinds]) => ({ group, kinds }));
})();

export function kindLabel(kind: AuditKind) {
  return KIND_META[kind]?.label ?? kind;
}

function refHref(refType: string | null, refId: string | null, payload?: Record<string, unknown> | null): string | null {
  if (!refType || !refId) return null;
  switch (refType) {
    case "project":  return `/projects/${refId}`;
    case "bom": {
      const projectId = payload && typeof payload.projectId === "string" ? payload.projectId : null;
      return projectId ? `/builder/${projectId}/${refId}` : null;
    }
    case "export":   return `/api/exports/${refId}/download`;
    case "workflow": return `/approvals`;
    case "vendor":   return `/vendors`;
    case "item":     return `/catalog`;
    case "user":     return `/users`;
    default:         return null;
  }
}

export function ActivityTable({ rows }: { rows: ActivityRow[] }) {
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Event</th>
              <th>Summary</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-3)" }}>
                  <div style={{ fontSize: 13 }}>No activity matches these filters</div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>Clear filters or pick a wider date range.</div>
                </td>
              </tr>
            )}
            {rows.map(r => {
              const meta = KIND_META[r.kind] ?? { label: r.kind, tone: "gray" as Tone, group: "—" };
              const href = refHref(r.refType, r.refId, r.payload as Record<string, unknown> | null | undefined);
              return (
                <tr key={r.id}>
                  <td className="muted" style={{ verticalAlign: "top", whiteSpace: "nowrap" }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td style={{ verticalAlign: "top" }}>{r.actorName ?? "system"}</td>
                  <td style={{ verticalAlign: "top" }}>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </td>
                  <td style={{ verticalAlign: "top" }}>{r.summary}</td>
                  <td style={{ verticalAlign: "top", textAlign: "right" }}>
                    {href && (
                      r.refType === "export" ? (
                        <a href={href} target="_blank" rel="noopener noreferrer">Open</a>
                      ) : (
                        <Link href={href}>Open</Link>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
