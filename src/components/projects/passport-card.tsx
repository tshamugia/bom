import { formatDate, formatDateTime } from "@/lib/format";
import type { UserOption } from "@/components/drawings/drawing-form-fields";
import { PassportEditDialog } from "./passport-edit-dialog";

type PassportProject = {
  id: string;
  code: string;
  name: string;
  ownerId: string | null;
  clientName: string | null;
  contractNo: string | null;
  siteAddress: string | null;
  description: string | null;
  startDate: string | null;
  targetDate: string | null;
  createdAt: Date;
};

const dash = <span className="muted">—</span>;

/** Who the project is for, where, under which contract and by when. */
export function PassportCard({
  project,
  users,
  canDelete,
  readOnly = false,
}: {
  project: PassportProject;
  users: UserOption[];
  canDelete: boolean;
  readOnly?: boolean;
}) {
  const manager = users.find(u => u.id === project.ownerId);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">Project passport</h3>
          <p className="card-sub">Client, contract, site and dates.</p>
        </div>
        <span className="spacer" />
        {!readOnly && (
          <PassportEditDialog
            projectId={project.id}
            users={users}
            canDelete={canDelete}
            initial={{
              code: project.code,
              name: project.name,
              ownerId: project.ownerId ?? "",
              clientName: project.clientName ?? "",
              contractNo: project.contractNo ?? "",
              siteAddress: project.siteAddress ?? "",
              description: project.description ?? "",
              startDate: project.startDate ?? "",
              targetDate: project.targetDate ?? "",
            }}
          />
        )}
      </div>
      <div className="grid gap-x-8 gap-y-2 p-4 md:grid-cols-2">
        <dl className="kv">
          <dt>Client</dt>
          <dd style={{ fontWeight: project.clientName ? 600 : undefined }}>{project.clientName ?? dash}</dd>
          <dt>Contract no.</dt>
          <dd className="mono">{project.contractNo ?? dash}</dd>
          <dt>Site</dt>
          <dd>{project.siteAddress ?? dash}</dd>
        </dl>
        <dl className="kv">
          <dt>Project manager</dt>
          <dd>{manager?.name ?? dash}</dd>
          <dt>Start</dt>
          <dd>{project.startDate ? formatDate(project.startDate) : dash}</dd>
          <dt>Completion</dt>
          <dd>{project.targetDate ? formatDate(project.targetDate) : dash}</dd>
          <dt>Created</dt>
          <dd className="muted">{formatDateTime(project.createdAt)}</dd>
        </dl>
        {project.description && (
          <div className="md:col-span-2">
            <div className="field-label mb-1">Scope / notes</div>
            <div className="whitespace-pre-line text-[12.5px]">{project.description}</div>
          </div>
        )}
      </div>
    </div>
  );
}
