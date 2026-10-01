import { redirect } from "next/navigation";
import { PageHead } from "@/components/master/page-head";
import { RecipientsForm } from "@/components/drawings/recipients-form";
import { DisciplinesEditor } from "@/components/drawings/disciplines-editor";
import { ReminderSettingsForm } from "@/components/drawings/reminder-settings-form";
import { FileGateForm } from "@/components/drawings/file-gate-form";
import { HelpTip } from "@/components/help/help-tip";
import {
  getDrawingRecipientIds, getReminderRecipientIds, getReminderSettings, listDisciplines,
} from "@/server/queries/drawings";
import { getDrawingFileGate } from "@/server/queries/drawing-files";
import { listOwnerCandidates } from "@/server/queries/projects";
import { requireSession } from "@/server/auth-context";
import { isAdmin } from "@/lib/roles";
import { formatDate, formatDateTime } from "@/lib/format";

export default async function DrawingSettingsPage() {
  const session = await requireSession();
  // Email recipients, reminders and disciplines are workspace configuration — admins only.
  if (!isAdmin(session.user)) redirect("/settings");
  const [users, recipientIds, disciplines, reminders, reminderIds, fileGate] = await Promise.all([
    listOwnerCandidates(),
    getDrawingRecipientIds(null),
    listDisciplines(),
    getReminderSettings(),
    getReminderRecipientIds(null),
    getDrawingFileGate(),
  ]);
  const lastRun = reminders.lastRun
    ? `${formatDate(reminders.lastRun.day)}, ${reminders.lastRun.recipients} ${reminders.lastRun.recipients === 1 ? "person" : "people"}${
        reminders.lastRun.finishedAt ? ` (finished ${formatDateTime(reminders.lastRun.finishedAt)})` : ""
      }`
    : null;

  return (
    <>
      <PageHead
        title="Drawings"
        subtitle="Status emails, daily reminders, drawing PDFs, and the disciplines drawings are grouped by."
      />
      <div className="grid max-w-3xl gap-5">
        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Status notifications — all projects</h3>
              <p className="card-sub">
                These users are emailed about every drawing. The drawing owner and approving engineer are always included; each project can add more people on its own page.
              </p>
            </div>
          </div>
          <div className="p-4">
            <RecipientsForm projectId={null} users={users} initialIds={recipientIds} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Daily reminders</h3>
              <p className="card-sub">
                A morning digest of overdue drawings, pending approvals, open remarks and unacknowledged transmittals.
              </p>
            </div>
          </div>
          <div className="p-4">
            <ReminderSettingsForm initial={reminders.config} lastRun={lastRun} canEdit />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Reminder managers — all projects</h3>
              <p className="card-sub">
                Get the reminders ticked “Managers” above for every project. Each project page can add more people for that project only.
              </p>
            </div>
          </div>
          <div className="p-4">
            <RecipientsForm projectId={null} users={users} initialIds={reminderIds} list="reminders" />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title flex items-center gap-1.5">Drawing PDFs <HelpTip topic="drawing-pdf" /></h3>
              <p className="card-sub">
                The drawing owner or an admin uploads the PDF of the latest revision. Viewers see it, and transmittals link to it, from the same status on.
              </p>
            </div>
          </div>
          <div className="p-4">
            <FileGateForm initial={fileGate} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title">Disciplines</h3>
              <p className="card-sub">Options for the discipline field and the register filter.</p>
            </div>
          </div>
          <div className="p-4">
            <DisciplinesEditor disciplines={disciplines} />
          </div>
        </div>
      </div>
    </>
  );
}
