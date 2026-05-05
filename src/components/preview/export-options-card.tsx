"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export type ExportColumnKey =
  | "sku"
  | "description"
  | "manufacturer"
  | "vendor"
  | "unit"
  | "qty";

export type ExportColumns = Record<ExportColumnKey, boolean>;

export type ExportOpts = {
  columns: ExportColumns;
  groupByVendor: boolean;
  includeCoverPage: boolean;
  format: "xlsx" | "csv" | "pdf";
};

export const REQUIRED_COLUMNS: ReadonlySet<ExportColumnKey> = new Set(["sku", "qty"]);

const COLUMN_LABELS: Record<ExportColumnKey, string> = {
  sku: "SKU",
  description: "Description",
  manufacturer: "Manufacturer",
  vendor: "Vendor",
  unit: "Unit",
  qty: "Qty",
};

const COLUMN_ORDER: ExportColumnKey[] = [
  "sku",
  "description",
  "manufacturer",
  "vendor",
  "unit",
  "qty",
];

export const DEFAULT_EXPORT_OPTS: ExportOpts = {
  columns: {
    sku: true,
    description: true,
    manufacturer: true,
    vendor: true,
    unit: true,
    qty: true,
  },
  groupByVendor: false,
  includeCoverPage: false,
  format: "xlsx",
};

export function ExportOptionsCard({ opts, onChange }: { opts: ExportOpts; onChange: (next: ExportOpts) => void }) {
  function toggleColumn(key: ExportColumnKey, value: boolean) {
    if (REQUIRED_COLUMNS.has(key)) return;
    onChange({ ...opts, columns: { ...opts.columns, [key]: value } });
  }

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-3">
        <h3 className="text-[13.5px] font-semibold">Export options</h3>
      </div>
      <div className="flex flex-col gap-2.5 p-4 text-[12.5px]">
        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-3)]">Columns</div>
        {COLUMN_ORDER.map(key => {
          const required = REQUIRED_COLUMNS.has(key);
          return (
            <label
              key={key}
              className={`flex items-center gap-2 ${required ? "cursor-not-allowed opacity-70" : ""}`}
              title={required ? "Required column" : undefined}
            >
              <Checkbox
                checked={opts.columns[key]}
                disabled={required}
                onCheckedChange={v => toggleColumn(key, !!v)}
              />
              <span>
                {COLUMN_LABELS[key]}
                {required ? <span className="ml-1 text-[10.5px] text-[var(--color-text-3)]">(required)</span> : null}
              </span>
            </label>
          );
        })}

        <hr className="my-2 border-[var(--color-line-soft)]" />
        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-3)]">Layout</div>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={opts.groupByVendor}
            onCheckedChange={v => onChange({ ...opts, groupByVendor: !!v })}
          />
          <span>Group by vendor (separate sheets)</span>
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={opts.includeCoverPage}
            onCheckedChange={v => onChange({ ...opts, includeCoverPage: !!v })}
          />
          <span>Include cover page</span>
        </label>

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
