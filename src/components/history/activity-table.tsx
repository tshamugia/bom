import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/badge";
import type { ActivityRow, AuditKind } from "@/server/queries/audit";
import { formatDateTime } from "@/lib/format";
import { isAdminOnlyKind } from "@/lib/audit-kinds";

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
  "vendor.updated":         { label: "Vendor updated",    tone: "gray",    group: "Master" },
  "vendor.deleted":         { label: "Vendor deleted",    tone: "danger",  group: "Master" },
  "item.updated":           { label: "Item updated",      tone: "gray",    group: "Master" },
  "item.deleted":           { label: "Item deleted",      tone: "danger",  group: "Master" },
  "approval.cancelled":     { label: "Approval cancelled", tone: "warning", group: "Approval" },
  "user.created":           { label: "User created",      tone: "info",    group: "Users" },
  "user.disabled":          { label: "User enabled / disabled", tone: "warning", group: "Users" },
  "user.role.changed":      { label: "Role changed",      tone: "accent",  group: "Users" },
  "auth.signin":            { label: "Signed in",         tone: "gray",    group: "Security" },
  "auth.signin.failed":     { label: "Failed sign-in",    tone: "danger",  group: "Security" },
  "user.password.changed":  { label: "Password changed",  tone: "info",    group: "Security" },
  "user.password.reset":    { label: "Password reset",    tone: "warning", group: "Security" },
  "user.password.reset.requested": { label: "Reset requested", tone: "gray", group: "Security" },
  "settings.procurement.updated": { label: "Procurement settings", tone: "gray", group: "Settings" },
  "drawing.created":             { label: "Drawing created",       tone: "info",    group: "Drawings" },
  "drawing.updated":             { label: "Drawing updated",       tone: "gray",    group: "Drawings" },
  "drawing.deleted":             { label: "Drawing deleted",       tone: "warning", group: "Drawings" },
  "drawing.revision.created":    { label: "Drawing revision",      tone: "info",    group: "Drawings" },
  "drawing.status.changed":      { label: "Drawing status",        tone: "success", group: "Drawings" },
  "drawing.comment.added":       { label: "Drawing comment",       tone: "gray",    group: "Drawings" },
  "drawing.notification.sent":   { label: "Drawing email sent",    tone: "accent",  group: "Drawings" },
  "drawing.notification.failed": { label: "Drawing email failed",  tone: "danger",  group: "Drawings" },
  "drawing.settings.updated":    { label: "Drawing settings",      tone: "gray",    group: "Drawings" },
  "drawing.time.logged":         { label: "Time logged",           tone: "gray",    group: "Drawings" },
  "drawing.time.deleted":        { label: "Time removed",          tone: "warning", group: "Drawings" },
  "drawing.remark.added":        { label: "Remark added",          tone: "warning", group: "Drawings" },
  "drawing.remark.resolved":     { label: "Remark resolved",       tone: "success", group: "Drawings" },
  "drawing.remark.reopened":     { label: "Remark reopened",       tone: "warning", group: "Drawings" },
  "drawing.transmittal.sent":    { label: "Drawing issued",        tone: "accent",  group: "Drawings" },
  "drawing.transmittal.acknowledged": { label: "Issue acknowledged", tone: "success", group: "Drawings" },
  "drawing.reminders.sent":      { label: "Reminders sent",        tone: "accent",  group: "Drawings" },
  "drawing.reminders.failed":    { label: "Reminders failed",      tone: "danger",  group: "Drawings" },
  "drawing.report.exported":     { label: "Drawing report",        tone: "accent",  group: "Drawings" },
  "bom.drawing.linked":          { label: "Drawing linked",        tone: "info",    group: "BOM" },
  "bom.drawing.unlinked":        { label: "Drawing unlinked",      tone: "warning", group: "BOM" },
  "bom.drawing.updated":         { label: "Drawing refs updated",  tone: "info",    group: "BOM" },
  "project.updated":             { label: "Project updated",       tone: "gray",    group: "Project / BOM" },
  "project.contact.changed":     { label: "Project contact",       tone: "gray",    group: "Project / BOM" },
  "project.milestone.changed":   { label: "Project milestone",     tone: "info",    group: "Project / BOM" },
  "project.disciplines.changed": { label: "Project disciplines",   tone: "gray",    group: "Project / BOM" },
  "dashboard.report.exported":   { label: "Dashboard report",      tone: "accent",  group: "Export" },
};

export type KindGroup = { group: string; kinds: AuditKind[] };

/** Every event kind, grouped for the filter menu. Admin-only kinds are included. */
export const KIND_GROUPS: KindGroup[] = (() => {
  const groups = new Map<string, AuditKind[]>();
  for (const k of Object.keys(KIND_META) as AuditKind[]) {
    const g = KIND_META[k].group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(k);
  }
  return [...groups.entries()].map(([group, kinds]) => ({ group, kinds }));
})();

/** The groups History → Activity offers (no security or admin events). */
export const ACTIVITY_KIND_GROUPS: KindGroup[] = KIND_GROUPS
  .map(g => ({ group: g.group, kinds: g.kinds.filter(k => !isAdminOnlyKind(k)) }))
  .filter(g => g.kinds.length > 0);

export function kindLabel(kind: AuditKind) {
  return KIND_META[kind]?.label ?? kind;
}

export function kindMeta(kind: AuditKind): { label: string; tone: Tone; group: string } {
  return KIND_META[kind] ?? { label: kind, tone: "gray", group: "—" };
}

export function refHref(
  refType: string | null,
  refId: string | null,
  payload?: Record<string, unknown> | null,
  readOnly = false,
): string | null {
  if (!refType || !refId) return null;
  switch (refType) {
    case "project":  return `/projects/${refId}`;
    case "bom": {
      const projectId = payload && typeof payload.projectId === "string" ? payload.projectId : null;
      // Viewers can't open the builder, so their BOM links go to the read-only preview.
      return projectId ? `/${readOnly ? "preview" : "builder"}/${projectId}/${refId}` : null;
    }
    case "export":   return `/api/exports/${refId}/download`;
    case "workflow": return `/approvals`;
    case "vendor":   return `/vendors`;
    case "item":     return `/catalog`;
    case "user":     return `/users`;
    case "drawing":  return `/drawings/${refId}`;
    default:         return null;
  }
}

export function ActivityTable({ rows, readOnly = false }: { rows: ActivityRow[]; readOnly?: boolean }) {
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
              const href = refHref(r.refType, r.refId, r.payload as Record<string, unknown> | null | undefined, readOnly);
              return (
                <tr key={r.id}>
                  <td className="muted" style={{ verticalAlign: "top", whiteSpace: "nowrap" }}>
                    {formatDateTime(r.createdAt)}
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
