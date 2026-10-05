import Link from "next/link";
import { listAllBoms, listProjectsForPicker } from "@/server/queries/boms";
import { listOwnerCandidates } from "@/server/queries/projects";
import { requireSession } from "@/server/auth-context";
import { isAdmin } from "@/lib/roles";
import { BOM_STATUSES, type BomStatus, type RevisionStatus } from "@/lib/bom-status";
import { PageHead } from "@/components/master/page-head";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { Badge, RevisionStatusBadge } from "@/components/ui/badge";
import { NewBomDialog } from "@/components/boms/new-bom-dialog";
import { BomFilterBar, BomStatusTabs } from "@/components/boms/bom-filters";
import { DeleteBomDialog } from "@/components/boms/delete-bom-dialog";
import { formatDateTime } from "@/lib/format";

type SP = {
  q?: string;
  project?: string;
  owner?: string;
  status?: string;
  mine?: string;
  outdated?: string;
};

export default async function BuilderIndex({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const admin = isAdmin(session.user);
  const [rows, projects, users] = await Promise.all([
    listAllBoms({ projectId: sp.project, ownerId: sp.owner, search: sp.q }),
    listProjectsForPicker(),
    listOwnerCandidates(),
  ]);
  // Viewers can't own a BOM, so they aren't offered as owners.
  const owners = users.filter(u => u.role !== "viewer").map(u => ({ id: u.id, name: u.name }));

  let base = rows;
  if (sp.mine === "1") base = base.filter(b => b.ownerId === session.user.id);
  if (sp.outdated === "1") base = base.filter(b => b.outdatedDrawings > 0);

  const counts = Object.fromEntries(BOM_STATUSES.map(s => [s, 0])) as Record<BomStatus, number>;
  for (const b of base) {
    const s = BOM_STATUSES.find(x => x === b.activeRevisionStatus);
    if (s) counts[s]++;
  }
  const status = BOM_STATUSES.find(s => s === sp.status);
  const visible = status ? base.filter(b => b.activeRevisionStatus === status) : base;
  const filtered = !!(sp.q || sp.project || sp.owner || sp.mine || sp.outdated);

  return (
    <>
      <PageHead
        title="BOM Builder"
        subtitle="All BOMs across projects. Pick one to edit, or start a new one."
        actions={<NewBomDialog projects={projects} />}
      />

      <BomStatusTabs counts={counts} total={base.length} />

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap" }}>
          <BomFilterBar projects={projects} users={owners} />
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>{visible.length} BOM{visible.length === 1 ? "" : "s"}</span>
        </div>
        <div className="table-wrap">
          <table className="tbl tbl-list">
            <thead>
              <tr>
                <th>BOM</th>
                <th>Project</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Rev</th>
                <th className="num">Lines</th>
                <th>Modified by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: "center", padding: "28px 14px" }}>
                    {rows.length === 0 && !filtered
                      ? "No BOMs yet — click “New BOM” to create the first one."
                      : "No BOMs match these filters."}
                  </td>
                </tr>
              )}
              {visible.map(b => (
                <tr key={b.id}>
                  <td className="l-title">
                    <Link href={`/builder/${b.projectId}/${b.id}`} style={{ color: "inherit", fontWeight: 600 }}>
                      {b.name}
                    </Link>
                    {b.outdatedDrawings > 0 && (
                      <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>
                        {b.outdatedDrawings} outdated drawing{b.outdatedDrawings === 1 ? "" : "s"}
                      </div>
                    )}
                  </td>
                  <td className="l-meta">
                    <Link href={`/projects/${b.projectId}`} title={b.projectName} className="block max-[701px]:inline" style={{ color: "inherit" }}>
                      <div className="max-[701px]:hidden" style={{ fontWeight: 500 }}>{b.projectName}</div>
                      <div className="mono max-[701px]:inline" style={{ fontSize: 11.5, color: "var(--text-3)" }}>{b.projectCode}</div>
                    </Link>
                  </td>
                  <td className="l-meta">{b.ownerName ?? "—"}</td>
                  <td className="l-aside">
                    {b.activeRevisionStatus
                      ? <RevisionStatusBadge status={b.activeRevisionStatus as RevisionStatus} />
                      : <Badge tone="gray">—</Badge>}
                  </td>
                  <td className="mono muted l-meta">{b.activeRevisionLetter ? `Rev ${b.activeRevisionLetter}` : "—"}</td>
                  <td className="num l-meta" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {b.lineCount}
                    <span className="min-[701px]:hidden"> line{b.lineCount === 1 ? "" : "s"}</span>
                  </td>
                  <td className="muted l-hide" style={{ whiteSpace: "nowrap" }}>
                    <div>{formatDateTime(b.updatedAt)}</div>
                    {b.lastModifiedByName && <div style={{ fontSize: 11 }}>{b.lastModifiedByName}</div>}
                  </td>
                  <td className="l-end" style={{ textAlign: "right" }}>
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={`/builder/${b.projectId}/${b.id}`}>
                        <Button variant="ghost" size="sm"><Icon.Box size={14} className="mr-1" /> Open</Button>
                      </Link>
                      {admin && <DeleteBomDialog bomId={b.id} bomName={b.name} iconOnly />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
