"use client";

import { useBuilder } from "@/stores/builder-store";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

type Vendor = { id: string; name: string };
type Category = { id: string; name: string; subcategories: { id: string; name: string }[] };

export function FilterPanel({
  vendors, categories, vendorCounts, categoryCounts,
}: {
  vendors: Vendor[];
  categories: Category[];
  vendorCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}) {
  const s = useBuilder();
  const activeCatIds = Array.from(s.categoryFilter);
  const activeSubs = categories.filter(c => activeCatIds.includes(c.id)).flatMap(c => c.subcategories);

  return (
    <div className="sticky top-[68px] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Icon.Filter size={14} /> Filters
        </div>
        <Button variant="ghost" size="sm" onClick={s.clear}>Clear</Button>
      </div>

      <FilterGroup title="Vendor">
        {vendors.slice(0, 6).map(v => (
          <Row key={v.id} label={v.name} count={vendorCounts[v.name] ?? 0}
            checked={s.vendorFilter.has(v.name)}
            onChange={() => s.toggle("vendorFilter", v.name)} />
        ))}
      </FilterGroup>

      <Divider />
      <FilterGroup title="Category">
        {categories.map(c => (
          <Row key={c.id} label={c.name} count={categoryCounts[c.name] ?? 0}
            checked={s.categoryFilter.has(c.id)}
            onChange={() => s.toggle("categoryFilter", c.id)} />
        ))}
      </FilterGroup>

      {activeSubs.length > 0 && (
        <>
          <Divider />
          <FilterGroup title="Subcategory">
            {activeSubs.map(sb => (
              <Row key={sb.id} label={sb.name} count={0}
                checked={s.subcategoryFilter.has(sb.id)}
                onChange={() => s.toggle("subcategoryFilter", sb.id)} />
            ))}
          </FilterGroup>
        </>
      )}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 last:mb-0">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-3)]">{title}</div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}
function Divider() { return <hr className="my-3 border-[var(--color-line-soft)]" />; }

function Row({ label, count, checked, onChange }: { label: string; count: number; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 py-1 text-[12.5px]">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-3.5 w-3.5 accent-[var(--color-accent)]" />
      <span className="flex-1 capitalize text-[var(--color-text-2)]">{label}</span>
      <span className="text-[11px] tabular-nums text-[var(--color-text-4)]">{count}</span>
    </label>
  );
}
