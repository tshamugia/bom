"use client";

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
      <DropdownMenuTrigger render={<Button variant="outline"><Icon.Sliders size={14} className="mr-1.5" /> Columns</Button>} />
      <DropdownMenuContent className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(Object.keys(LABELS) as ColumnKey[]).map(k => (
            <DropdownMenuCheckboxItem key={k} checked={columns[k]} onCheckedChange={() => toggleColumn(k)}>
              {LABELS[k]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
