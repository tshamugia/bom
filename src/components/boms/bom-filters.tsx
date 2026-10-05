"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { BOM_STATUSES, BOM_STATUS_LABEL, type BomStatus } from "@/lib/bom-status";

type ProjectOption = { id: string; code: string; name: string };
type UserOption = { id: string; name: string };

function useBomsNav() {
  const router = useRouter();
  const params = useSearchParams();
  function go(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `/builder?${qs}` : "/builder");
  }
  return { params, go };
}

export function BomStatusTabs({ counts, total }: { counts: Record<BomStatus, number>; total: number }) {
  const { params, go } = useBomsNav();
  const active = params.get("status") ?? "all";
  const activeRef = useRef<HTMLButtonElement>(null);

  // On phones the tabs scroll sideways; keep the selected one in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <div className="tabs tabs-scroll" role="tablist" aria-label="BOM status">
      <button
        ref={active === "all" ? activeRef : undefined}
        role="tab"
        aria-selected={active === "all"}
        className={`tab ${active === "all" ? "active" : ""}`}
        onClick={() => go({ status: undefined })}
      >
        All <span className="muted">· {total}</span>
      </button>
      {BOM_STATUSES.map(s => (
        <button
          key={s}
          ref={active === s ? activeRef : undefined}
          role="tab"
          aria-selected={active === s}
          className={`tab ${active === s ? "active" : ""}`}
          onClick={() => go({ status: s })}
        >
          {BOM_STATUS_LABEL[s]} <span className="muted">· {counts[s]}</span>
        </button>
      ))}
    </div>
  );
}

const FILTER_KEYS = ["project", "owner", "mine", "outdated"] as const;

export function BomFilterBar({ projects, users }: { projects: ProjectOption[]; users: UserOption[] }) {
  const { params, go } = useBomsNav();
  const [open, setOpen] = useState(false);
  const activeCount = FILTER_KEYS.filter(k => params.get(k)).length;

  const toggle = (key: string, label: string) => (
    <label className="chip-toggle">
      <input type="checkbox" checked={params.get(key) === "1"} onChange={e => go({ [key]: e.target.checked ? "1" : undefined })} />
      {params.get(key) === "1" && <Icon.Check className="ico" style={{ width: 13, height: 13 }} />}
      {label}
    </label>
  );

  return (
    <div className="filters-bar">
      <div className="search-combo filters-search">
        <Icon.Search className="ico" />
        <input
          className="input"
          type="search"
          aria-label="Search BOMs"
          defaultValue={params.get("q") ?? ""}
          placeholder="Search BOM or project…"
          onChange={e => go({ q: e.target.value })}
        />
      </div>
      <button
        type="button"
        className="btn filters-toggle"
        aria-expanded={open}
        aria-controls="bom-filters"
        onClick={() => setOpen(o => !o)}
      >
        <Icon.Sliders className="ico" /> Filters
        {activeCount > 0 && <span className="filter-count-dot">{activeCount}</span>}
      </button>
      <div id="bom-filters" className="filters-panel" data-open={open || undefined}>
        <select className="select span-2" aria-label="Project" value={params.get("project") ?? ""} onChange={e => go({ project: e.target.value })}>
          <option value="">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <select className="select span-2" aria-label="Owner" value={params.get("owner") ?? ""} onChange={e => go({ owner: e.target.value })}>
          <option value="">All owners</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <div className="span-2 flex flex-wrap gap-2">
          {toggle("mine", "My BOMs")}
          {toggle("outdated", "Outdated drawings")}
        </div>
      </div>
    </div>
  );
}
