"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
        await sendBomToProcurement({ revisionId: targetId, options: opts });
        toast.success("BOM emailed to procurement and sent for review");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Send failed";
        if (msg === "PROCUREMENT_RECIPIENTS_NOT_CONFIGURED") {
          toast.error("No procurement recipients configured. Ask an admin to set them in Settings → Procurement email.");
        } else if (msg === "SMTP_NOT_CONFIGURED") {
          toast.error("Email is not configured on the server. Ask an admin to set up SMTP.");
        } else {
          toast.error(msg);
        }
      }
    });
  }

  const totalUnits = p.lines.reduce((s, l) => s + l.qty, 0);
  const vendorCount = new Set(p.lines.map(l => l.vendorName).filter(Boolean)).size;

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">{p.bomName}</h1>
          <p className="text-[13px] text-[var(--color-text-3)]">
            {p.projectCode} · Preview &amp; export the latest revision.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/builder/${p.projectId}/${p.bomId}`)}>
            <Icon.ArrowLeft size={14} className="mr-1.5" /> Back to builder
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Icon.Print size={14} className="mr-1.5" /> Print
          </Button>
          <Button
            variant="outline"
            disabled={pending || !p.procurementRevision}
            title={!p.procurementRevision ? "Commit a revision before sending to procurement." : undefined}
            onClick={sendForReview}
          >
            <Icon.Send size={14} className="mr-1.5" /> Send to procurement
            {p.procurementRevision && p.procurementRevision.letter !== p.revisionLetter
              ? <span className="ml-1 text-[11px] text-[var(--color-text-3)]">(Rev {p.procurementRevision.letter})</span>
              : null}
          </Button>
          <GenerateDialog
            revisionId={p.revisionId}
            projectCode={p.projectCode}
            revisionLetter={p.revisionLetter}
            lineCount={p.lines.length}
            opts={opts}
            trigger={<Button><Icon.Download size={14} className="mr-1.5" /> Generate Excel</Button>}
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
