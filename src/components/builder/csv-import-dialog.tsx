"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { importCsv } from "@/server/actions/bom-lines";
import { toast } from "sonner";

export function CsvImportDialog({ revisionId }: { revisionId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Array<{ sku: string; qty: string }>>([]);
  const [pending, start] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const norm = (res.data as Array<Record<string, string>>).map(r => ({
          sku: r.sku ?? r.SKU ?? r.Sku ?? "",
          qty: r.qty ?? r.Qty ?? r.quantity ?? "0",
        })).filter(r => r.sku);
        setRows(norm);
      },
    });
  }

  function submit() {
    start(async () => {
      const r = await importCsv({ revisionId, rows });
      setOpen(false);
      setRows([]);
      toast.success(`${r.added} lines imported${r.missing.length ? ` · ${r.missing.length} unknown SKUs skipped` : ""}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline"><Icon.Sheet size={14} className="mr-1.5" /> Import CSV</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Import CSV</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-[12.5px] text-[var(--color-text-3)]">CSV needs columns <code>sku</code> and <code>qty</code>. Unknown SKUs are skipped and reported.</p>
          <input type="file" accept=".csv" onChange={onFile} className="text-[12.5px]" />
          {rows.length > 0 && <p className="text-[12.5px]">{rows.length} rows ready to import.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || rows.length === 0} onClick={submit}>{pending ? "Importing…" : "Import"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
