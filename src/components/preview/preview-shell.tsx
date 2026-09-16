"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { DocumentPreview } from "./document-preview";
import { SummaryCard } from "./summary-card";
import { ExportOptionsCard, DEFAULT_EXPORT_OPTS, type ExportOpts } from "./export-options-card";
import { ApproversCard } from "./approvers-card";
import { GenerateDialog } from "./generate-dialog";
import type { Line } from "@/components/builder/sectioned-line-table";
import type { SectionInfo } from "@/components/builder/section-row";
import { sendBomToProcurement } from "@/server/actions/procurement";
import { toast } from "sonner";

type Props = {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectOwner: string;
  projectTarget: string;
  bomId: string;
  bomName: string;
  revisionId: string;
  revisionLetter: string;
  procurementRevision: { id: string; letter: string } | null;
  lines: Line[];
  sections: SectionInfo[];
  steps: Array<{ position: number; role: string; status: "pending" | "active" | "approved" | "rejected" | "skipped"; assigneeName: string | null }> | null;
};

export function PreviewShell(p: Props) {
  const router = useRouter();
  const [opts, setOpts] = useState<ExportOpts>(DEFAULT_EXPORT_OPTS);
  const [pending, startReview] = useTransition();

  function sendForReview() {
    if (!p.procurementRevision) return;
    const targetId = p.procurementRevision.id;
    startReview(async () => {
      try {
        const res = await sendBomToProcurement({ revisionId: targetId, options: opts });
        if (res.ok) {
          toast.success("BOM emailed to procurement and sent for review");
          return;
        }
        switch (res.code) {
          case "PROCUREMENT_RECIPIENTS_NOT_CONFIGURED":
            toast.error("No procurement recipients configured. Ask an admin to set them in Settings → Procurement email.");
            break;
          case "SMTP_NOT_CONFIGURED":
            toast.error("Email is not configured on the server. Ask an admin to set up SMTP.");
            break;
          case "SMTP_SEND_FAILED":
            toast.error(`Email failed to send: ${res.message}`);
            break;
          case "EXPORT_FAILED":
            toast.error(`Could not generate the Excel export: ${res.message}`);
            break;
          case "APPROVAL_FAILED":
            toast.error(`Email sent, but starting the approval workflow failed: ${res.message}`);
            break;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Send failed";
        toast.error(msg);
      }
    });
  }

  const totalUnits = p.lines.reduce((s, l) => s + l.qty, 0);
  const vendorCount = new Set(p.lines.map(l => l.vendorName).filter(Boolean)).size;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Preview &amp; Generate</h1>
          <p className="page-sub">
            {p.projectCode} · {p.bomName} — review the generated document, then export to Excel for procurement.
          </p>
        </div>
        <div className="split">
          <div className="steps">
            <div className="step done"><span className="num"><Icon.Check className="ico" /></span> Build</div>
            <span className="arrow">›</span>
            <div className="step active"><span className="num">2</span> Preview</div>
            <span className="arrow">›</span>
            <div className="step"><span className="num">3</span> Generate</div>
          </div>
          <button className="btn" onClick={() => router.push(`/builder/${p.projectId}/${p.bomId}`)}>
            <Icon.ArrowLeft className="ico" /> Back to builder
          </button>
          <button className="btn" onClick={() => window.print()}>
            <Icon.Print className="ico" /> Print
          </button>
          <button
            className="btn"
            disabled={pending || !p.procurementRevision}
            title={!p.procurementRevision ? "Commit a revision before sending to procurement." : undefined}
            onClick={sendForReview}
          >
            <Icon.Send className="ico" /> Send to procurement
            {p.procurementRevision && p.procurementRevision.letter !== p.revisionLetter
              ? <span className="ml-1 text-[11px] text-[var(--color-text-3)]">(Rev {p.procurementRevision.letter})</span>
              : null}
          </button>
          <GenerateDialog
            revisionId={p.revisionId}
            projectCode={p.projectCode}
            revisionLetter={p.revisionLetter}
            lineCount={p.lines.length}
            opts={opts}
            trigger={<button type="button" className="btn btn-primary"><Icon.Download className="ico" /> Generate Excel</button>}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_280px] items-start gap-4">
        <DocumentPreview
          project={{
            code: p.projectCode, name: p.projectName, owner: p.projectOwner,
            target: p.projectTarget,
          }}
          revisionLetter={p.revisionLetter}
          lines={p.lines}
          sections={p.sections}
          generatedOn={new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
        />
        <div className="sticky top-[68px] flex flex-col gap-3">
          <SummaryCard lines={p.lines.length} totalUnits={totalUnits} vendors={vendorCount} />
          <ExportOptionsCard opts={opts} onChange={setOpts} />
          <ApproversCard steps={p.steps} />
        </div>
      </div>
    </>
  );
}
