import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { formatDateTime, formatRelative } from "@/lib/format";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { TRANSMITTAL_PURPOSE_LABEL } from "@/lib/drawing-meta";
import { drawingFileHref } from "@/lib/drawing-files";
import type { listBomSends, listIssuedTransmittals } from "@/server/queries/status-overview";

type BomSend = Awaited<ReturnType<typeof listBomSends>>[number];
type Issued = Awaited<ReturnType<typeof listIssuedTransmittals>>[number];

function Empty({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-3)" }}>{text}</td>
    </tr>
  );
}

/** BOM revisions sent to procurement; phones get list rows (`tbl-list`). */
export function BomSendsTable({ rows }: { rows: BomSend[] }) {
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="tbl tbl-list">
          <thead>
            <tr>
              <th>BOM</th>
              <th>Project</th>
              <th>Rev</th>
              <th className="num">Lines</th>
              <th>Sent</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <Empty cols={7} text="No BOMs have been sent yet." />
            ) : (
              rows.map(r => (
                <tr key={r.id}>
                  <td className="l-title">
                    <Link href={`/preview/${r.projectId}/${r.bomId}`} style={{ color: "inherit", fontWeight: 600 }}>{r.bomName}</Link>
                    <span className="mono muted min-[701px]:hidden" style={{ fontSize: 12 }}> Rev {r.revisionLetter}</span>
                  </td>
                  <td className="l-line">
                    <span className="mono muted" style={{ fontSize: 11.5 }}>{r.projectCode}</span>{" "}
                    <span>{r.projectName}</span>
                  </td>
                  <td className="mono muted l-hide" style={{ fontSize: 11.5 }}>Rev {r.revisionLetter}</td>
                  <td className="num tabular l-meta">
                    {r.lineCount}<span className="min-[701px]:hidden"> lines</span>
                  </td>
                  <td className="muted l-meta" title={formatDateTime(r.requestedAt)} style={{ whiteSpace: "nowrap" }}>
                    {formatRelative(r.requestedAt)}
                    {r.requestedByName && <span className="min-[701px]:hidden"> by {r.requestedByName}</span>}
                  </td>
                  <td className="l-hide"><Badge tone="success">Sent to procurement</Badge></td>
                  <td className="l-aside" style={{ textAlign: "right" }}>
                    {r.exportId ? (
                      <a
                        href={`/api/exports/${r.exportId}/download`}
                        download
                        className="btn btn-icon btn-ghost"
                        title={r.exportFileName ?? "Download"}
                        aria-label={`Download ${r.bomName} Rev ${r.revisionLetter}`}
                      >
                        <Icon.Download className="ico" />
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReceiptBadge({ r }: { r: Issued }) {
  if (r.superseded) return <Badge tone="gray">Superseded</Badge>;
  if (r.acknowledgedAt) return <Badge tone="success">Received</Badge>;
  if (!r.recipientUserId) return <Badge tone="gray">Recorded</Badge>;
  return <Badge tone="warning">Not confirmed</Badge>;
}

/** Drawing revisions issued to people (transmittals), with their receipt state. */
export function IssuedDrawingsTable({ rows, userId }: { rows: Issued[]; userId: string }) {
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="tbl tbl-list">
          <thead>
            <tr>
              <th>Drawing</th>
              <th>Name</th>
              <th>To</th>
              <th>Purpose</th>
              <th>Sent</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <Empty cols={6} text="No drawing revisions have been issued yet." />
            ) : (
              rows.map(r => (
                <tr key={r.id}>
                  <td className="mono l-title" style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/drawings/${r.drawingId}`} style={{ color: "inherit", fontWeight: 600 }}>{r.code}</Link>{" "}
                    <span className="muted">{formatDrawingRevision(r.revisionNumber)}</span>
                    <div className="muted max-[701px]:hidden" style={{ fontSize: 11 }}>{r.projectCode}</div>
                  </td>
                  <td className="l-line">
                    <Link href={`/drawings/${r.drawingId}`} style={{ color: "inherit" }}>{r.name}</Link>
                  </td>
                  <td className="l-meta">
                    <span className="min-[701px]:hidden">To </span>
                    {r.recipientUserId === userId ? "you" : r.recipientName ?? r.externalName ?? "—"}
                  </td>
                  <td className="muted l-meta" style={{ whiteSpace: "nowrap" }}>{TRANSMITTAL_PURPOSE_LABEL[r.purpose]}</td>
                  <td className="muted l-meta" title={formatDateTime(r.createdAt)} style={{ whiteSpace: "nowrap" }}>
                    {formatRelative(r.createdAt)}
                    {r.sentByName && <div className="max-[701px]:hidden" style={{ fontSize: 11 }}>by {r.sentByName}</div>}
                  </td>
                  <td className="l-aside" style={{ whiteSpace: "nowrap" }}>
                    <span className="inline-flex items-center gap-1.5">
                      <ReceiptBadge r={r} />
                      {r.pdfFileId && (
                        <a
                          href={drawingFileHref(r.pdfFileId)}
                          target="_blank"
                          rel="noopener"
                          className="btn btn-icon btn-ghost"
                          aria-label={`Open the PDF of ${r.code} ${formatDrawingRevision(r.revisionNumber)}`}
                          title="Open PDF"
                        >
                          <Icon.Doc className="ico" />
                        </a>
                      )}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
