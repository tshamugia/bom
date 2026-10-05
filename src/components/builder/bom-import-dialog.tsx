"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { BomImportFilePicker, useBomImportFile } from "@/components/boms/bom-import-file";
import { commitBomImport } from "@/server/actions/bom-import";
import { bomImportFailureMessage } from "@/lib/schemas/bom-import";
import { toast } from "@/lib/toast";

/** Imports the BOM template file into the open draft revision. */
export function BomImportDialog({ revisionId }: { revisionId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const importFile = useBomImportFile(revisionId);
  const router = useRouter();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) importFile.reset();
  }

  function submit() {
    if (!importFile.file) return;
    const fd = new FormData();
    fd.set("file", importFile.file);
    fd.set("mode", "revision");
    fd.set("revisionId", revisionId);
    start(async () => {
      try {
        const r = await commitBomImport(fd);
        if (!r.ok) {
          importFile.showFail(r);
          toast.error(bomImportFailureMessage(r));
          return;
        }
        toast.success(`${r.lines} line${r.lines === 1 ? "" : "s"} imported`
          + (r.itemsCreated > 0 ? ` · ${r.itemsCreated} new catalog item${r.itemsCreated === 1 ? "" : "s"}` : ""));
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Import failed");
      }
    });
  }

  const lines = importFile.summary?.lines ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<button type="button" className="btn"><Icon.Upload className="ico" /> Import</button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import lines from file</DialogTitle>
          <DialogDescription>
            Adds the file&apos;s lines to this draft. Sections are matched by name; missing ones are created.
          </DialogDescription>
        </DialogHeader>
        <BomImportFilePicker state={importFile} inputId="bom-import-file" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button disabled={pending || !importFile.ready} onClick={submit}>
            {pending ? "Importing…" : lines > 0 ? `Import ${lines} line${lines === 1 ? "" : "s"}` : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
