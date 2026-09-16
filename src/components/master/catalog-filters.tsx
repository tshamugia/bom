"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";

function useCatalogNav() {
  const router = useRouter();
  const params = useSearchParams();
  function go(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`/catalog?${next.toString()}`);
  }
  return { params, go };
}

export function CatalogTabs({
  categories,
  totalCount,
}: {
  categories: { id: string; name: string; itemCount: number }[];
  totalCount: number;
}) {
  const { params, go } = useCatalogNav();
  const activeCat = params.get("cat") ?? "all";

  return (
    <div className="tabs">
      <button className={`tab ${activeCat === "all" ? "active" : ""}`} onClick={() => go({ cat: undefined })}>
        All <span className="muted">· {totalCount}</span>
      </button>
      {categories.map((c) => (
        <button key={c.id} className={`tab ${activeCat === c.id ? "active" : ""}`} onClick={() => go({ cat: c.id })}>
          {c.name} <span className="muted">· {c.itemCount}</span>
        </button>
      ))}
    </div>
  );
}

export function CatalogSearch() {
  const { params, go } = useCatalogNav();
  const search = params.get("q") ?? "";
  return (
    <div className="search-combo" style={{ flex: 1, maxWidth: 360, position: "relative" }}>
      <Icon.Search className="ico" />
      <input
        className="input"
        style={{ paddingLeft: 32 }}
        defaultValue={search}
        placeholder="Search SKU, description, manufacturer…"
        onChange={(e) => go({ q: e.target.value })}
      />
    </div>
  );
}
