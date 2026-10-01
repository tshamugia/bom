import { Icon } from "@/components/icons";
import { HelpTip } from "@/components/help/help-tip";
import { BlockedNote } from "@/components/help/blocked-note";
import { formatDateTime } from "@/lib/format";
import { DRAWING_STATUS_LABEL, formatDrawingRevision, type DrawingStatus } from "@/lib/drawing-status";
import { drawingFileHref, drawingFileName, formatFileSize } from "@/lib/drawing-files";
import type { DrawingFileRow } from "@/server/queries/drawing-files";
import { DrawingStatusBadge } from "./drawing-status-badge";
import { UploadPdfDialog } from "./upload-pdf-dialog";
import { RemovePdfDialog } from "./remove-pdf-dialog";

export type PdfRevision = { id: string; number: number; status: DrawingStatus; file: DrawingFileRow | null };

/** Open in the browser (a new tab) and Download — the links everyone gets. */
export function PdfLinks({ fileId, className = "btn btn-sm" }: { fileId: string; className?: string }) {
  return (
    <>
      <a href={drawingFileHref(fileId)} target="_blank" rel="noopener" className={className}>
        <Icon.Eye className="ico" /> Open
      </a>
      <a href={drawingFileHref(fileId, true)} className={className}>
        <Icon.Download className="ico" /> Download
      </a>
    </>
  );
}

function PdfFile({
  code,
  rev,
  file,
  label,
  children,
}: {
  code: string;
  rev: PdfRevision;
  file: DrawingFileRow;
  label?: string;
  children: React.ReactNode;
}) {
  const name = drawingFileName(code, rev.number);
  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3">
      <span className="irow-ico tone-red"><Icon.Doc className="ico" /></span>
      <div className="min-w-0 flex-1">
        <div className="irow-title mono">{name}</div>
        <div className="irow-meta">
          {label && <span>{label}</span>}
          <DrawingStatusBadge status={rev.status} />
          <span>{formatFileSize(file.sizeBytes)}</span>
          <span>
            Uploaded by {file.uploadedByName ?? "—"}
            {file.uploadedAt && <> · {formatDateTime(file.uploadedAt)}</>}
          </span>
          {file.originalName !== name && <span className="[overflow-wrap:anywhere]">Original name: {file.originalName}</span>}
        </div>
      </div>
      <div className="flex w-full flex-wrap gap-2 min-[701px]:w-auto [&>*]:flex-1 min-[701px]:[&>*]:flex-none">
        {children}
      </div>
    </div>
  );
}

/**
 * The drawing's PDF: the one of the revision this page is about, plus an
 * earlier revision's PDF when that one has none yet.
 */
export function DrawingPdfCard({
  code,
  main,
  earlier,
  note,
  emptyText,
  canUpload,
  blockedReason,
  canRemove,
}: {
  code: string;
  /** `null` when no revision may show a PDF yet (viewers before the first approval). */
  main: PdfRevision | null;
  earlier: PdfRevision | null;
  note: string | null;
  emptyText: string;
  canUpload: boolean;
  /** Why an editor can't upload right now; `null` hides the note. */
  blockedReason: string | null;
  canRemove: boolean;
}) {
  const statusLabel = main ? DRAWING_STATUS_LABEL[main.status] : "";
  return (
    <div className="card mb-5">
      <div className="card-head">
        <div className="min-w-0">
          <h3 className="card-title flex items-center gap-1.5">Drawing PDF <HelpTip topic="drawing-pdf" /></h3>
          {note && <p className="card-sub">{note}</p>}
        </div>
      </div>

      {main?.file ? (
        <PdfFile code={code} rev={main} file={main.file} label={formatDrawingRevision(main.number)}>
          <PdfLinks fileId={main.file.id} />
          {canUpload && (
            <UploadPdfDialog
              revisionId={main.id}
              revisionNumber={main.number}
              drawingCode={code}
              statusLabel={statusLabel}
              replacing
            />
          )}
          {canRemove && <RemovePdfDialog fileId={main.file.id} fileName={drawingFileName(code, main.number)} />}
        </PdfFile>
      ) : (
        <div className="grid gap-2.5 px-4 py-3">
          <p className="muted m-0 text-[12.5px]">{emptyText}</p>
          {main && canUpload && (
            <div>
              <UploadPdfDialog revisionId={main.id} revisionNumber={main.number} drawingCode={code} statusLabel={statusLabel} />
            </div>
          )}
          {blockedReason && <BlockedNote topic="drawing-pdf">{blockedReason}</BlockedNote>}
        </div>
      )}

      {earlier?.file && (
        <div style={{ borderTop: "1px solid var(--line-soft)" }}>
          <PdfFile code={code} rev={earlier} file={earlier.file} label={`Earlier revision · ${formatDrawingRevision(earlier.number)}`}>
            <PdfLinks fileId={earlier.file.id} />
          </PdfFile>
        </div>
      )}
    </div>
  );
}
