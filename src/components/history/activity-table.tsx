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
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
            <th className="px-4 py-2.5 text-left font-medium">When</th>
            <th className="px-4 py-2.5 text-left font-medium">Who</th>
            <th className="px-4 py-2.5 text-left font-medium">Event</th>
            <th className="px-4 py-2.5 text-left font-medium">Summary</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-[var(--color-text-3)]">
                <div className="text-[13px]">No activity matches these filters</div>
                <div className="mt-1 text-[12px]">Clear filters or pick a wider date range.</div>
              </td>
            </tr>
          )}
          {rows.map(r => {
            const meta = KIND_META[r.kind] ?? { label: r.kind, tone: "gray" as Tone, group: "—" };
            const href = refHref(r.refType, r.refId, r.payload as Record<string, unknown> | null | undefined);
            return (
              <tr
                key={r.id}
                className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]"
              >
                <td className="px-4 py-2.5 align-top text-[var(--color-text-3)] whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 align-top">{r.actorName ?? "system"}</td>
                <td className="px-4 py-2.5 align-top">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </td>
                <td className="px-4 py-2.5 align-top">{r.summary}</td>
                <td className="px-4 py-2.5 align-top text-right">
                  {href && (
                    <Link
                      href={href}
                      className="text-[var(--color-info)] hover:underline"
                      target={r.refType === "export" ? "_blank" : undefined}
                    >
                      Open
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
