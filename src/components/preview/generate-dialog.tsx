"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { toast } from "sonner";
import { generateExport } from "@/server/actions/exports";
import type { ExportOpts } from "./export-options-card";

/** Saves a base64 workbook via a blob link — no popup, so nothing for the browser to block. */
function saveXlsx(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

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
      let res;
      try {
        res = await generateExport({
          revisionId,
          options: {
            columns: opts.columns,
            groupByVendor: opts.groupByVendor,
            includeCoverPage: opts.includeCoverPage,
          },
        });
      } catch {
        res = { ok: false as const, error: "Couldn't reach the server. Please try again." };
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      saveXlsx(res.data, res.fileName);
      setOpen(false);
      toast.success(`BOM exported — ${res.fileName}`);
      router.push("/history");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <Icon.Sheet size={16} />
            </div>
            <div>
              <DialogTitle>Generate Excel file</DialogTitle>
              <p className="text-[12px] text-[var(--color-text-3)]">Confirm details before export</p>
            </div>
          </div>
        </DialogHeader>
        <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-y-2 gap-x-4 p-1 text-[12.5px] max-[480px]:grid-cols-[104px_minmax(0,1fr)] max-[480px]:gap-x-3">
          <dt className="text-[var(--color-text-3)]">File name</dt>
          <dd className="m-0 font-mono text-[12px] [overflow-wrap:anywhere]">{fileName}</dd>
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
