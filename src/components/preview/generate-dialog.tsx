"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { toast } from "sonner";
import { generateExport } from "@/server/actions/exports";
import type { ExportOpts } from "./export-options-card";

export function GenerateDialog({
  revisionId, projectCode, revisionLetter, lineCount, opts, trigger,
}: {
  revisionId: string;
  projectCode: string;
  revisionLetter: string;
  lineCount: number;
  opts: ExportOpts;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const fileName = `BOM_${projectCode}_Rev_${revisionLetter}.xlsx`;

  function go() {
    start(async () => {
      const ex = await generateExport({
        revisionId,
        options: {
          columns: opts.columns,
          groupByVendor: opts.groupByVendor,
          includeCoverPage: opts.includeCoverPage,
        },
      });
      setOpen(false);
      toast.success(`BOM exported — ${ex.fileName}`);
      window.open(`/api/exports/${ex.id}/download`, "_blank");
      router.push("/history");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <Icon.Sheet size={16} />
            </div>
            <div>
              <DialogTitle>Generate Excel file</DialogTitle>
              <p className="text-[12px] text-[var(--color-text-3)]">Confirm details before export</p>
            </div>
          </div>
        </DialogHeader>
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 gap-x-4 p-1 text-[12.5px]">
          <dt className="text-[var(--color-text-3)]">File name</dt>
          <dd className="m-0 font-mono text-[12px]">{fileName}</dd>
          <dt className="text-[var(--color-text-3)]">Project</dt>
          <dd className="m-0">{projectCode}</dd>
          <dt className="text-[var(--color-text-3)]">Format</dt>
          <dd className="m-0">Excel Workbook (.xlsx)</dd>
          <dt className="text-[var(--color-text-3)]">Lines</dt>
          <dd className="m-0">{lineCount}</dd>
          <dt className="text-[var(--color-text-3)]">Will be archived to</dt>
          <dd className="m-0">History → {projectCode}</dd>
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={go} disabled={pending}>
            <Icon.Download size={14} className="mr-1.5" />
            {pending ? "Generating…" : "Generate & download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
