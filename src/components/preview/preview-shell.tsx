"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { DocumentPreview } from "./document-preview";
import { SummaryCard } from "./summary-card";
import { ExportOptionsCard, type ExportOpts } from "./export-options-card";
import { ApproversCard } from "./approvers-card";
import { GenerateDialog } from "./generate-dialog";
import type { Line } from "@/components/builder/bom-line-table";

type Props = {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectOwner: string;
  projectTarget: string;
  projectQuantity: number;
  revisionId: string;
  revisionLetter: string;
  lines: Line[];
};

export function PreviewShell(p: Props) {
  const router = useRouter();
  const [opts, setOpts] = useState<ExportOpts>({
    includeVendorPricing: true,
    includeStockAvailability: true,
    groupByVendor: false,
    includeCoverPage: false,
    format: "xlsx",
  });

  const subtotal = p.lines.reduce((s, l) => s + l.qty * Number(l.unitPriceSnapshot), 0);
  const tax = subtotal * 0.08;
  const grand = subtotal + tax;
  const totalUnits = p.lines.reduce((s, l) => s + l.qty, 0);
  const vendorCount = new Set(p.lines.map(l => l.vendorName).filter(Boolean)).size;

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Preview &amp; Generate</h1>
          <p className="text-[13px] text-[var(--color-text-3)]">Review the generated document, then export to Excel for procurement.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/builder/${p.projectId}`)}>
            <Icon.ArrowLeft size={14} className="mr-1.5" /> Back to builder
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Icon.Print size={14} className="mr-1.5" /> Print
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
            target: p.projectTarget, quantity: p.projectQuantity,
          }}
          revisionLetter={p.revisionLetter}
          lines={p.lines}
          generatedOn={new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
        />
        <div className="sticky top-[68px] flex flex-col gap-3">
          <SummaryCard lines={p.lines.length} totalUnits={totalUnits} vendors={vendorCount} subtotal={subtotal} tax={tax} grand={grand} />
          <ExportOptionsCard opts={opts} onChange={setOpts} />
          <ApproversCard />
        </div>
      </div>
    </>
  );
}
