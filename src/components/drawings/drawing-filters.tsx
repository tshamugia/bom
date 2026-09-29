"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { DRAWING_STATUSES, DRAWING_STATUS_LABEL, type DrawingStatus } from "@/lib/drawing-status";
import type { DisciplineOption, ProjectOption, UserOption } from "./drawing-form-fields";

function useDrawingsNav() {
  const router = useRouter();
  const params = useSearchParams();
  function go(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `/drawings?${qs}` : "/drawings");
  }
  return { params, go };
}

export function DrawingStatusTabs({ counts, total }: { counts: Record<DrawingStatus, number>; total: number }) {
  const { params, go } = useDrawingsNav();
  const active = params.get("status") ?? "all";
  return (
    <div className="tabs" style={{ flexWrap: "wrap" }}>
      <button className={`tab ${active === "all" ? "active" : ""}`} onClick={() => go({ status: undefined })}>
        All <span className="muted">· {total}</span>
      </button>
      {DRAWING_STATUSES.map(s => (
        <button key={s} className={`tab ${active === s ? "active" : ""}`} onClick={() => go({ status: s })} style={{ whiteSpace: "nowrap" }}>
          {DRAWING_STATUS_LABEL[s]} <span className="muted">· {counts[s]}</span>
        </button>
      ))}
    </div>
  );
}

export function DrawingFilterBar({
  projects,
  disciplines,
  users,
}: {
  projects: ProjectOption[];
  disciplines: DisciplineOption[];
  users: UserOption[];
}) {
  const { params, go } = useDrawingsNav();
  const selectStyle = { width: "auto", minWidth: 140, maxWidth: 220 } as const;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="search-combo" style={{ flex: "1 1 220px", maxWidth: 320 }}>
        <Icon.Search className="ico" />
        <input
          className="input"
          defaultValue={params.get("q") ?? ""}
          placeholder="Search code or name…"
          onChange={e => go({ q: e.target.value })}
        />
      </div>
      <select className="select" style={selectStyle} value={params.get("project") ?? ""} onChange={e => go({ project: e.target.value })}>
        <option value="">All projects</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
      </select>
      <select className="select" style={selectStyle} value={params.get("discipline") ?? ""} onChange={e => go({ discipline: e.target.value })}>
        <option value="">All disciplines</option>
        {disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <select className="select" style={selectStyle} value={params.get("owner") ?? ""} onChange={e => go({ owner: e.target.value })}>
        <option value="">All owners</option>
        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <label className="filter-row" style={{ padding: 0 }}>
        <input type="checkbox" checked={params.get("overdue") === "1"} onChange={e => go({ overdue: e.target.checked ? "1" : undefined })} />
        <span className="filter-name">Overdue</span>
      </label>
      <label className="filter-row" style={{ padding: 0 }}>
        <input type="checkbox" checked={params.get("mine") === "1"} onChange={e => go({ mine: e.target.checked ? "1" : undefined })} />
        <span className="filter-name">Awaiting my approval</span>
      </label>
      <label className="filter-row" style={{ padding: 0 }}>
        <input type="checkbox" checked={params.get("received") === "1"} onChange={e => go({ received: e.target.checked ? "1" : undefined })} />
        <span className="filter-name">Issued to me</span>
      </label>
    </div>
  );
}
