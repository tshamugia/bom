import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth-context";
import { canEdit, isAdmin } from "@/lib/roles";
import {
  getDrawing, listDisciplines, listDrawingEvents, listDrawingRevisions, listProjectOptions,
} from "@/server/queries/drawings";
import {
  listBomLinksForDrawing, listRemarks, listTimeEntries, listTransmittals,
} from "@/server/queries/drawing-control";
import { getDrawingFileGate, listDrawingFiles } from "@/server/queries/drawing-files";
import { listOwnerCandidates } from "@/server/queries/projects";
import { PageHead } from "@/components/master/page-head";
import { DrawingStatusBadge } from "@/components/drawings/drawing-status-badge";
import { EditDrawingDialog } from "@/components/drawings/edit-drawing-dialog";
import { NewRevisionDialog } from "@/components/drawings/new-revision-dialog";
import { ChangeStatusDialog } from "@/components/drawings/change-status-dialog";
import { ReviewPanel } from "@/components/drawings/review-panel";
import { DeleteDrawingButton } from "@/components/drawings/delete-drawing-button";
import { RevisionHistory } from "@/components/drawings/revision-history";
import { TimeCard } from "@/components/drawings/time-card";
import { RemarksCard } from "@/components/drawings/remarks-card";
import { TransmittalsCard } from "@/components/drawings/transmittals-card";
import { BomUsageCard } from "@/components/drawings/bom-usage-card";
import { DrawingPipeline } from "@/components/drawings/drawing-pipeline";
import { FileLocation } from "@/components/drawings/file-location";
import { DrawingPdfCard, type PdfRevision } from "@/components/drawings/drawing-pdf-card";
import { HelpTip } from "@/components/help/help-tip";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatDrawingRevision, isDrawingOverdue } from "@/lib/drawing-status";
import { checkFileUpload, fileUploadErrorMessage, isFileStatus } from "@/lib/drawing-files";

export default async function DrawingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const [drawing, revisions, events, projects, disciplines, users, timeEntries, remarks, transmittals, bomLinks, files, fileGate] =
    await Promise.all([
      getDrawing(id),
      listDrawingRevisions(id),
      listDrawingEvents(id),
      listProjectOptions(),
      listDisciplines(),
      listOwnerCandidates(),
      listTimeEntries(id),
      listRemarks(id),
      listTransmittals(id),
      listBomLinksForDrawing(id),
      listDrawingFiles(id),
      getDrawingFileGate(),
    ]);
  if (!drawing || revisions.length === 0) notFound();
  const admin = isAdmin(session.user);
  const readOnly = !canEdit(session.user);
  // Viewers can't own or approve drawings, so they aren't offered in those pickers.
  const engineers = users.filter(u => u.role !== "viewer");
  const revisionOptions = revisions.map(r => ({ id: r.id, number: r.number }));

  const current = revisions[0];
  const revLabel = formatDrawingRevision(current.number);
  const overdue = isDrawingOverdue(drawing.dueDate, current.status);
  const canReview = !readOnly && current.reviewerId === session.user.id && drawing.ownerId !== session.user.id;

  const fileOf = new Map(files.map(f => [f.revisionId, f]));
  const asPdf = (r: (typeof revisions)[number]): PdfRevision => ({
    id: r.id, number: r.number, status: r.status, file: fileOf.get(r.id) ?? null,
  });
  // Viewers only see a revision that passed the upload rule — by default, approved by the client.
  const issued = revisions.find(r => isFileStatus(r.status, fileGate));
  const issuedWord = fileGate === "approved" ? "approved" : "finished";
  const upload = checkFileUpload({
    status: current.status,
    gate: fileGate,
    isLatest: true,
    actorId: session.user.id,
    actorIsAdmin: admin,
    ownerId: drawing.ownerId,
  });
  const pdfCard = readOnly ? (
    <DrawingPdfCard
      code={drawing.code}
      main={issued ? asPdf(issued) : null}
      earlier={null}
      note={issued && issued.id !== current.id
        ? `${revLabel} is still being worked on — this is the latest ${issuedWord} revision.`
        : null}
      emptyText={issued
        ? `The PDF of ${formatDrawingRevision(issued.number)} hasn't been uploaded yet.`
        : `No revision is ${issuedWord} yet — the PDF shows up here once one is.`}
      canUpload={false}
      blockedReason={null}
      canRemove={false}
    />
  ) : (
    <DrawingPdfCard
      code={drawing.code}
      main={asPdf(current)}
      earlier={fileOf.has(current.id) ? null : revisions.slice(1).map(asPdf).find(r => r.file) ?? null}
      note={null}
      emptyText={`No PDF for ${revLabel} yet.`}
      canUpload={upload.ok}
      blockedReason={upload.ok ? null : fileUploadErrorMessage(upload.error, fileGate)}
      canRemove={admin}
    />
  );
  const transmittalsCard = (
    <TransmittalsCard
      transmittals={transmittals}
      latestRevisionId={current.id}
      latestRevisionNumber={current.number}
      users={users}
      currentUserId={session.user.id}
      readOnly={readOnly}
    />
  );

  return (
    <>
      <PageHead
        title={`${drawing.code} — ${drawing.name}`}
        subtitle={`${drawing.projectCode} · ${drawing.projectName}`}
        actions={
          <>
            {admin && <DeleteDrawingButton drawingId={drawing.id} code={drawing.code} />}
            {!readOnly && (
              <>
                <EditDrawingDialog
                  drawingId={drawing.id}
                  initial={{
                    projectId: drawing.projectId,
                    code: drawing.code,
                    name: drawing.name,
                    disciplineId: drawing.disciplineId ?? "",
                    ownerId: drawing.ownerId ?? "",
                    dueDate: drawing.dueDate ?? "",
                    estimatedHours: drawing.estimatedHours?.toString() ?? "",
                    fileLocation: drawing.fileLocation ?? "",
                  }}
                  projects={projects}
                  disciplines={disciplines}
                  users={engineers}
                />
                <NewRevisionDialog drawingId={drawing.id} currentNumber={current.number} />
                <ChangeStatusDialog
                  revisionId={current.id}
                  revisionNumber={current.number}
                  status={current.status}
                  ownerId={drawing.ownerId}
                  reviewerId={current.reviewerId}
                  reviewed={current.reviewedAt !== null}
                  currentUserId={session.user.id}
                  users={engineers}
                />
              </>
            )}
          </>
        }
      />

      {current.status === "need-approval" && (
        <ReviewPanel
          revisionId={current.id}
          revisionLabel={revLabel}
          reviewerName={current.reviewerName}
          canReview={canReview}
        />
      )}

      {/* Viewers come for the PDF, so it leads for them. */}
      {readOnly && pdfCard}

      <div className="card mb-5">
        <div className="card-head">
          <h3 className="card-title">Details</h3>
          <span className="spacer" />
          <span className="mono text-[12px] font-semibold">{revLabel}</span>
          <DrawingStatusBadge status={current.status} />
          <HelpTip topic="drawing-statuses" />
        </div>
        <DrawingPipeline status={current.status} ownerName={drawing.ownerName} reviewerName={current.reviewerName} />
        <dl className="kv p-4" style={{ borderTop: "1px solid var(--line-soft)" }}>
          <dt>Project</dt>
          <dd><Link href={`/projects/${drawing.projectId}`} className="hover:underline">{drawing.projectCode} — {drawing.projectName}</Link></dd>
          <dt>Discipline</dt>
          <dd>{drawing.disciplineName ?? "—"}</dd>
          <dt>Owner</dt>
          <dd>{drawing.ownerName ?? "—"}</dd>
          <dt>Due date</dt>
          <dd style={overdue ? { color: "var(--red)", fontWeight: 600 } : undefined}>
            {drawing.dueDate ? formatDate(drawing.dueDate) : "—"}{overdue && " · overdue"}
          </dd>
          <dt>File location</dt>
          <dd>
            {drawing.fileLocation
              ? <FileLocation path={drawing.fileLocation} />
              : <span className="muted">{readOnly ? "—" : "Not set — add it with Edit"}</span>}
          </dd>
          {current.reviewerName && (current.status === "need-approval" || current.reviewedAt) && (
            <>
              <dt>Approving engineer</dt>
              <dd>
                {current.reviewerName}
                {current.reviewedAt ? <span className="muted"> · approved {formatDateTime(current.reviewedAt)}</span> : null}
              </dd>
            </>
          )}
          <dt>Created</dt>
          <dd>{drawing.createdByName ?? "—"} · {formatDateTime(drawing.createdAt)}</dd>
          <dt>Last change</dt>
          <dd>{drawing.lastModifiedByName ?? "—"} · {formatDateTime(drawing.updatedAt)}</dd>
        </dl>
      </div>

      {!readOnly && pdfCard}

      <div className="grid-2 mb-5" style={{ alignItems: "start" }}>
        {/* Viewers confirm receipt in Transmittals, so it comes first for them. */}
        {readOnly && transmittalsCard}
        <RemarksCard remarks={remarks} revisions={revisionOptions} readOnly={readOnly} />
        {!readOnly && transmittalsCard}
        {/* Hours and BOM links are engineering internals — viewers follow status and issues. */}
        {!readOnly && (
          <>
            <TimeCard
              estimatedHours={drawing.estimatedHours}
              entries={timeEntries}
              revisions={revisionOptions}
              currentUserId={session.user.id}
              canManageAll={admin}
              readOnly={readOnly}
            />
            <BomUsageCard links={bomLinks} latestRevisionNumber={current.number} readOnly={readOnly} />
          </>
        )}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">Revisions</h2>
        <span className="text-[12px] text-[var(--color-text-3)]">{revisions.length} total</span>
      </div>
      <RevisionHistory revisions={revisions} events={events} files={files} drawingCode={drawing.code} readOnly={readOnly} />
    </>
  );
}
