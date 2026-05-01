"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export type ExportOpts = {
  includeVendorPricing: boolean;
  includeStockAvailability: boolean;
  groupByVendor: boolean;
  includeCoverPage: boolean;
  format: "xlsx" | "csv" | "pdf";
};

export function ExportOptionsCard({ opts, onChange }: { opts: ExportOpts; onChange: (next: ExportOpts) => void }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-3">
        <h3 className="text-[13.5px] font-semibold">Export options</h3>
      </div>
      <div className="flex flex-col gap-2.5 p-4 text-[12.5px]">
        <Row k="includeVendorPricing"     opts={opts} onChange={onChange}>Include vendor pricing</Row>
        <Row k="includeStockAvailability" opts={opts} onChange={onChange}>Include stock availability</Row>
        <Row k="groupByVendor"            opts={opts} onChange={onChange}>Group by vendor (separate sheets)</Row>
        <Row k="includeCoverPage"         opts={opts} onChange={onChange}>Include cover page</Row>
        <hr className="my-2 border-[var(--color-line-soft)]" />
        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-3)]">Format</div>
        <Select value={opts.format} onValueChange={v => onChange({ ...opts, format: v as ExportOpts["format"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
            <SelectItem value="csv" disabled>CSV — coming soon</SelectItem>
            <SelectItem value="pdf" disabled>PDF — coming soon</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function Row({ k, opts, onChange, children }: { k: keyof Omit<ExportOpts, "format">; opts: ExportOpts; onChange: (n: ExportOpts) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <Checkbox checked={opts[k]} onCheckedChange={v => onChange({ ...opts, [k]: !!v })} />
      <span>{children}</span>
    </label>
  );
}
