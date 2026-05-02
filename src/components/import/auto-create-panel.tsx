"use client";
import { useState } from "react";
import type { DryRunResult } from "@/lib/schemas/import";

export function AutoCreatePanel({ result }: { result: DryRunResult }) {
  const [open, setOpen] = useState(false);
  const v = result.newVendors.length;
  const c = result.newCategories.length;
  const s = result.newSubcategories.length;
  if (v + c + s === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[12.5px]"
        onClick={() => setOpen(o => !o)}
      >
        <span>Will create {v} vendor{v === 1 ? "" : "s"}, {c} categor{c === 1 ? "y" : "ies"}, {s} subcategor{s === 1 ? "y" : "ies"}</span>
        <span className="text-[var(--color-text-3)]">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-[var(--color-line-soft)] px-4 py-3 text-[12px]">
          {v > 0 && <div><span className="text-[var(--color-text-3)]">Vendors: </span>{result.newVendors.join(", ")}</div>}
          {c > 0 && <div><span className="text-[var(--color-text-3)]">Categories: </span>{result.newCategories.join(", ")}</div>}
          {s > 0 && <div><span className="text-[var(--color-text-3)]">Subcategories: </span>{result.newSubcategories.map(p => `${p.category}/${p.subcategory}`).join(", ")}</div>}
        </div>
      )}
    </div>
  );
}
