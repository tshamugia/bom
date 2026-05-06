"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

type ProjectOption = { id: string; code: string; name: string };

export function HistoryFilters({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const initial = sp.get("project")?.split(",").filter(Boolean) ?? [];
  const initialFrom = sp.get("from") ?? "";
  const initialTo = sp.get("to") ?? "";

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(initial);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const activeCount = (selected.length > 0 ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);

  function toggle(id: string) {
    setSelected(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));
  }

  function apply() {
    const params = new URLSearchParams();
    if (selected.length > 0) params.set("project", selected.join(","));
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    router.push(qs ? `/history?${qs}` : "/history");
    setOpen(false);
  }

  function clear() {
    setSelected([]);
    setFrom("");
    setTo("");
    router.push("/history");
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" onClick={() => setOpen(o => !o)}>
        <Icon.Filter size={14} className="mr-1.5" />
        Filter
        {activeCount > 0 && (
          <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-80 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-card)]">
          <div className="mb-3">
            <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
              Project
            </div>
            <div className="max-h-44 overflow-y-auto rounded-md border border-[var(--color-line-soft)]">
              {projects.length === 0 ? (
                <div className="px-2 py-1.5 text-[12px] text-[var(--color-text-3)]">No projects</div>
              ) : (
                projects.map(p => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-[12.5px] hover:bg-[var(--color-surface-2)]"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="font-mono text-[11px] text-[var(--color-text-3)]">{p.code}</span>
                    <span className="truncate">{p.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <label className="block">
              <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
                From
              </div>
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
                To
              </div>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={clear}>Clear</Button>
            <Button size="sm" onClick={apply}>Apply</Button>
          </div>
        </div>
      )}
    </div>
  );
}
