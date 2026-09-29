"use client";

import { useState } from "react";
import { useBuilder } from "@/stores/builder-store";
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
  // Below the desktop layout the panel sits above the table, so it starts collapsed.
  const [open, setOpen] = useState(false);
  const activeCatIds = Array.from(s.categoryFilter);
  const activeSubs = categories.filter(c => activeCatIds.includes(c.id)).flatMap(c => c.subcategories);
  const activeCount = s.vendorFilter.size + s.categoryFilter.size + s.subcategoryFilter.size;

  return (
    <div className="filter-panel">
      <h4 className={open ? undefined : "max-[961px]:mb-0"}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon.Filter className="ico" /> Filters
          {activeCount > 0 && <span className="filter-count-dot min-[961px]:hidden">{activeCount}</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button className="btn btn-ghost btn-sm" onClick={s.clear}>Clear</button>
          <button
            type="button"
            className="btn btn-sm min-[961px]:hidden"
            aria-expanded={open}
            aria-controls="builder-filter-groups"
            onClick={() => setOpen(o => !o)}
          >
            {open ? "Hide" : "Show"}
          </button>
        </span>
      </h4>

      <div id="builder-filter-groups" className={open ? undefined : "max-[961px]:hidden"}>
        <div className="filter-group">
          <label className="field-label">Vendor</label>
          {vendors.slice(0, 6).map(v => (
            <Row key={v.id} label={v.name} count={vendorCounts[v.name] ?? 0}
              checked={s.vendorFilter.has(v.name)}
              onChange={() => s.toggle("vendorFilter", v.name)} />
          ))}
        </div>

        <hr className="div" />
        <div className="filter-group">
          <label className="field-label">Category</label>
          {categories.map(c => (
            <Row key={c.id} label={c.name} count={categoryCounts[c.name] ?? 0}
              checked={s.categoryFilter.has(c.id)}
              onChange={() => s.toggle("categoryFilter", c.id)} />
          ))}
        </div>

        {activeSubs.length > 0 && (
          <>
            <hr className="div" />
            <div className="filter-group">
              <label className="field-label">Subcategory</label>
              {activeSubs.map(sb => (
                <Row key={sb.id} label={sb.name} count={0}
                  checked={s.subcategoryFilter.has(sb.id)}
                  onChange={() => s.toggle("subcategoryFilter", sb.id)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, count, checked, onChange }: { label: string; count: number; checked: boolean; onChange: () => void }) {
  return (
    <label className="filter-row">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="filter-name capitalize">{label}</span>
      <span className="filter-count">{count}</span>
    </label>
  );
}
