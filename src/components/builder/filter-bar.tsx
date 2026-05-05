"use client";

import { useBuilder } from "@/stores/builder-store";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type Vendor = { id: string; name: string };
type Subcategory = { id: string; name: string };
type Category = { id: string; name: string; subcategories: Subcategory[] };

export function FilterBar({
  vendors, categories, vendorCounts, categoryCounts,
}: {
  vendors: Vendor[];
  categories: Category[];
  vendorCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}) {
  const s = useBuilder();
  const vendorActive = s.vendorFilter.size;
  const categoryActive = s.categoryFilter.size + s.subcategoryFilter.size;
  const anyActive = vendorActive + categoryActive > 0;

  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex items-center gap-1.5 pr-1 text-[12px] font-medium text-[var(--color-text-3)]">
        <Icon.Filter size={14} /> Filters
      </div>

      <FacetTrigger label="Vendor" count={vendorActive}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Vendor</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {vendors.map(v => (
            <DropdownMenuCheckboxItem
              key={v.id}
              checked={s.vendorFilter.has(v.name)}
              onCheckedChange={() => s.toggle("vendorFilter", v.name)}
              closeOnClick={false}
            >
              <span className="flex-1">{v.name}</span>
              <span className="ml-3 text-[11px] tabular-nums text-[var(--color-text-4)]">{vendorCounts[v.name] ?? 0}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </FacetTrigger>

      <FacetTrigger label="Category" count={categoryActive} width="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Category</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {categories.map(c => {
            const checked = s.categoryFilter.has(c.id);
            return (
              <div key={c.id}>
                <DropdownMenuCheckboxItem
                  checked={checked}
                  onCheckedChange={() => s.toggle("categoryFilter", c.id)}
                  closeOnClick={false}
                >
                  <span className="flex-1">{c.name}</span>
                  <span className="ml-3 text-[11px] tabular-nums text-[var(--color-text-4)]">{categoryCounts[c.name] ?? 0}</span>
                </DropdownMenuCheckboxItem>
                {checked && c.subcategories.map(sb => (
                  <DropdownMenuCheckboxItem
                    key={sb.id}
                    checked={s.subcategoryFilter.has(sb.id)}
                    onCheckedChange={() => s.toggle("subcategoryFilter", sb.id)}
                    closeOnClick={false}
                    className="pl-6"
                  >
                    <span className="flex-1 text-[var(--color-text-2)]">{sb.name}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </div>
            );
          })}
        </DropdownMenuGroup>
      </FacetTrigger>

      {anyActive && (
        <Button variant="ghost" size="sm" onClick={s.clear} className="ml-auto">Clear</Button>
      )}
    </div>
  );
}

function FacetTrigger({ label, count, width = "w-56", children }: {
  label: string;
  count: number;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            {label}
            {count > 0 && (
              <span className="ml-1 rounded-full bg-[var(--color-accent)]/15 px-1.5 text-[10px] font-semibold tabular-nums text-[var(--color-accent)]">
                {count}
              </span>
            )}
            <Icon.ChevDown size={12} className="ml-1 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent className={width}>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
