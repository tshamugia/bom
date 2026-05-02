"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { prepareImport } from "@/server/actions/import";

export function UploadZone() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [headerErr, setHeaderErr] = useState<{ expected: string[]; found: string[] } | null>(null);

  function onFile(f: File) {
    setHeaderErr(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", f);
      const r = await prepareImport(fd);
      if (!r.ok) {
        if (r.error === "header_mismatch") setHeaderErr({ expected: r.expected, found: r.found });
        else if (r.error === "too_large") toast.error("File too large (max 10 MB)");
        else if (r.error === "unreadable") toast.error("Could not read file");
        else if (r.error === "unauthorized") toast.error("Not authorized");
        return;
      }
      router.replace(`/catalog/import?id=${r.result.importId}`);
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] p-8 text-center">
        <p className="text-[13px] font-medium">Upload a catalog XLSX</p>
        <p className="mt-1 text-[12px] text-[var(--color-text-3)]">Use the strict template — header row must match exactly.</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <a href="/templates/catalog-import-template.xlsx" download>
            <Button variant="outline">Download template</Button>
          </a>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="text-[12.5px]"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            disabled={pending}
          />
          {pending && <span className="text-[12px] text-[var(--color-text-3)]">Reading…</span>}
        </div>
      </div>

      {headerErr && (
        <div className="rounded-lg border border-red-300/60 bg-red-50/50 p-3 text-[12px]">
          <div className="font-medium">Header row doesn&apos;t match the template.</div>
          <div className="mt-1 text-[var(--color-text-3)]">
            Expected: <code>{headerErr.expected.join(", ")}</code><br />
            Found: <code>{headerErr.found.join(", ") || "(empty)"}</code>
          </div>
        </div>
      )}
    </div>
  );
}
