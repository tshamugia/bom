"use client";

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/icons";
import { useTweaks, type ColumnKey } from "@/stores/tweaks-store";

const LABELS: Record<ColumnKey, string> = {
  sku: "SKU / Part #", desc: "Description", cat: "Category", vendor: "Vendor",
  mfr: "Manufacturer", unit: "Unit", qty: "Quantity",
};

export function ColumnsMenu() {
  const { columns, toggleColumn } = useTweaks();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className="btn"><Icon.Sliders className="ico" /> Columns</button>} />
      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(LABELS) as ColumnKey[]).map(k => (
          <DropdownMenuCheckboxItem key={k} checked={columns[k]} onCheckedChange={() => toggleColumn(k)}>
            {LABELS[k]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
