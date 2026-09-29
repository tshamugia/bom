import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, listOwnerCandidates } from "@/server/queries/projects";
import { listBomsByProject } from "@/server/queries/boms";
import { getProjectPassport } from "@/server/queries/project-passport";
import { PageHead } from "@/components/master/page-head";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { BomList, type BomRow } from "@/components/projects/bom-list";
import { NewBomDialog } from "@/components/boms/new-bom-dialog";
import { PassportCard } from "@/components/projects/passport-card";
import { ContactsCard } from "@/components/projects/contacts-card";
import { MilestonesCard } from "@/components/projects/milestones-card";
import { DisciplinesCard, type DisciplineStats } from "@/components/projects/disciplines-card";
import { requireSession } from "@/server/auth-context";
import { canEdit, isAdmin } from "@/lib/roles";
import {
  getDrawingRecipientIds, getReminderRecipientIds, listDisciplines, listDrawings, listProjectOptions,
} from "@/server/queries/drawings";
import { DrawingsTable } from "@/components/drawings/drawings-table";
import { NewDrawingDialog } from "@/components/drawings/new-drawing-dialog";
import { RecipientsForm } from "@/components/drawings/recipients-form";
import { isClosedStatus, isDrawingOverdue, todayIso } from "@/lib/drawing-status";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const [project, owners, bomList, drawingRows, projectOptions, disciplines, recipientIds, reminderIds, passport] =
    await Promise.all([
      getProject(id),
      listOwnerCandidates(),
      listBomsByProject(id),
      listDrawings({ projectIds: [id] }),
      listProjectOptions(),
      listDisciplines(),
      getDrawingRecipientIds(id),
      getReminderRecipientIds(id),
      getProjectPassport(id),
    ]);
  if (!project) notFound();
  const admin = isAdmin(session.user);
  const readOnly = !canEdit(session.user);
  const today = todayIso();

  const disciplineStats: Record<string, DisciplineStats> = {};
  for (const d of drawingRows) {
    if (!d.disciplineId) continue;
    const st = (disciplineStats[d.disciplineId] ??= { total: 0, closed: 0, overdue: 0 });
    st.total++;
    if (isClosedStatus(d.status)) st.closed++;
    if (isDrawingOverdue(d.dueDate, d.status, today)) st.overdue++;
  }

  return (
    <>
      <PageHead
        title={project.name}
        subtitle={[project.code, project.clientName].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/dashboard?project=${project.id}`}>
              <Button variant="outline"><Icon.Home size={14} className="mr-1.5" /> Dashboard</Button>
            </Link>
            <Link href={`/projects/${project.id}/history`}>
              <Button variant="outline"><Icon.History size={14} className="mr-1.5" /> History</Button>
            </Link>
            {!readOnly && <NewBomDialog projectId={project.id} />}
          </>
        }
      />

      <div className="grid gap-4">
        <PassportCard project={project} users={owners} canDelete={admin} readOnly={readOnly} />
        <div className="grid-2" style={{ alignItems: "start", gap: 16 }}>
          <ContactsCard projectId={project.id} contacts={passport.contacts} readOnly={readOnly} />
          <MilestonesCard
            projectId={project.id}
            startDate={project.startDate}
            targetDate={project.targetDate}
            milestones={passport.milestones}
            today={today}
            readOnly={readOnly}
          />
        </div>
        <DisciplinesCard
          projectId={project.id}
          disciplines={passport.disciplines}
          options={disciplines}
          users={owners}
          stats={disciplineStats}
          readOnly={readOnly}
        />
      </div>

      <div className="mt-8 mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">BOMs</h2>
        <span className="text-[12px] text-[var(--color-text-3)]">{bomList.length} total</span>
      </div>
      <BomList projectId={project.id} rows={bomList as BomRow[]} canDelete={admin} readOnly={readOnly} />

      <div className="mt-8 mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">Drawings</h2>
        <div className="flex items-center gap-2">
          <Link href={`/drawings?project=${project.id}`} className="text-[12px] text-[var(--color-text-2)] hover:underline">
            Open in register
          </Link>
          {!readOnly && (
            <NewDrawingDialog
              projects={projectOptions}
              disciplines={disciplines}
              users={owners.filter(u => canEdit(u))}
              currentUserId={session.user.id}
              defaultProjectId={project.id}
            />
          )}
        </div>
      </div>
      <div className="card">
        <DrawingsTable
          rows={drawingRows}
          today={today}
          showProject={false}
          emptyText="No drawings in this project yet."
        />
      </div>

      <div className="mt-8 mb-2">
        <h2 className="text-[15px] font-semibold tracking-tight">Notifications</h2>
      </div>
      <div className="grid-2" style={{ alignItems: "start", gap: 16 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Drawing status emails</h3>
              <p className="card-sub">
                Emailed when a drawing in {project.code} changes status — in addition to the owner, the approving engineer and the list in Settings → Drawings.
              </p>
            </div>
          </div>
          <div className="p-4">
            <RecipientsForm projectId={project.id} users={owners} initialIds={recipientIds} readOnly={!admin} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Reminder managers</h3>
              <p className="card-sub">
                Get the daily drawing reminders for {project.code}, in addition to the managers in Settings → Drawings.
              </p>
            </div>
          </div>
          <div className="p-4">
            <RecipientsForm
              projectId={project.id}
              users={owners}
              initialIds={reminderIds}
              list="reminders"
              readOnly={!admin}
            />
          </div>
        </div>
      </div>
    </>
  );
}
