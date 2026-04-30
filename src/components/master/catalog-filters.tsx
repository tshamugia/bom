"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icons";

export function CatalogFilters({ categories }: { categories: { id: string; name: string; itemCount: number }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const activeCat = params.get("cat") ?? "all";
  const search = params.get("q") ?? "";

  function go(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`/catalog?${next.toString()}`);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--color-line)]">
        <Tab active={activeCat === "all"} onClick={() => go({ cat: undefined })}>All</Tab>
        {categories.map(c => (
          <Tab key={c.id} active={activeCat === c.id} onClick={() => go({ cat: c.id })}>
            {c.name} <span className="text-[var(--color-text-3)]">· {c.itemCount}</span>
          </Tab>
        ))}
      </div>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Icon.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-4)]" />
          <Input
            defaultValue={search}
            placeholder="Search SKU, description, manufacturer…"
            className="pl-9"
            onChange={e => go({ q: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] font-medium ${
        active
          ? "border-[var(--color-accent)] text-[var(--color-text)]"
          : "border-transparent text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
      }`}
    >
      {children}
    </button>
  );
}
