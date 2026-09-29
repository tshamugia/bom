import { requireSession } from "@/server/auth-context";
import { canEdit } from "@/lib/roles";
import { listDisciplines, listDrawings, listProjectOptions } from "@/server/queries/drawings";
import { listOwnerCandidates } from "@/server/queries/projects";
import Link from "next/link";
import { PageHead } from "@/components/master/page-head";
import { Icon } from "@/components/icons";
import { NewDrawingDialog } from "@/components/drawings/new-drawing-dialog";
import { DrawingFilterBar, DrawingStatusTabs } from "@/components/drawings/drawing-filters";
import { DrawingsTable } from "@/components/drawings/drawings-table";
import { DRAWING_STATUSES, isDrawingOverdue, todayIso, type DrawingStatus } from "@/lib/drawing-status";

type SP = {
  q?: string;
  project?: string;
  discipline?: string;
  owner?: string;
  status?: string;
  overdue?: string;
  mine?: string;
  received?: string;
};

export default async function DrawingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const [rows, projects, disciplines, users] = await Promise.all([
    listDrawings({
      projectIds: sp.project ? [sp.project] : undefined,
      disciplineIds: sp.discipline ? [sp.discipline] : undefined,
      ownerIds: sp.owner ? [sp.owner] : undefined,
      receivedBy: sp.received === "1" ? session.user.id : undefined,
      search: sp.q,
    }),
    listProjectOptions(),
    listDisciplines(),
    listOwnerCandidates(),
  ]);

  const readOnly = !canEdit(session.user);
  // Viewers can't own drawings, so they aren't offered as owners.
  const engineers = users.filter(u => u.role !== "viewer");

  const today = todayIso();
  let base = rows;
  if (sp.overdue === "1") base = base.filter(r => isDrawingOverdue(r.dueDate, r.status, today));
  if (sp.mine === "1") base = base.filter(r => r.status === "need-approval" && r.reviewerId === session.user.id);

  const counts = Object.fromEntries(DRAWING_STATUSES.map(s => [s, 0])) as Record<DrawingStatus, number>;
  for (const r of base) counts[r.status]++;
  const status = DRAWING_STATUSES.find(s => s === sp.status);
  const visible = status ? base.filter(r => r.status === status) : base;

  const overdueCount = rows.filter(r => isDrawingOverdue(r.dueDate, r.status, today)).length;

  return (
    <>
      <PageHead
        title="Drawings"
        subtitle={`Engineering drawing register — revisions, status and approvals.${overdueCount ? ` ${overdueCount} overdue.` : ""}`}
        actions={
          <>
            <Link href={sp.project ? `/dashboard?project=${sp.project}` : "/dashboard"} className="btn">
              <Icon.Activity className="ico" /> Dashboard
            </Link>
            {!readOnly && (
              <NewDrawingDialog
                projects={projects}
                disciplines={disciplines}
                users={engineers}
                currentUserId={session.user.id}
                defaultProjectId={sp.project}
              />
            )}
          </>
        }
      />

      <DrawingStatusTabs counts={counts} total={base.length} />

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap" }}>
          <DrawingFilterBar projects={projects} disciplines={disciplines} users={users} />
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>{visible.length} drawing{visible.length === 1 ? "" : "s"}</span>
        </div>
        <DrawingsTable
          rows={visible}
          today={today}
          emptyText={rows.length === 0 && !sp.q && !sp.project && !sp.discipline && !sp.owner && !sp.received
            ? readOnly ? "No drawings yet." : "No drawings yet — click “New drawing” to add the first one."
            : "No drawings match these filters."}
        />
      </div>
    </>
  );
}
