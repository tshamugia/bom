"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { KIND_GROUPS, kindLabel } from "./activity-table";
import type { AuditKind } from "@/server/queries/audit";

type ProjectOption = { id: string; code: string; name: string };
type ActorOption = { id: string; name: string | null };

export function ActivityFilters({
  projects,
  actors,
}: {
  projects: ProjectOption[];
  actors: ActorOption[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const initialProjects = sp.get("project")?.split(",").filter(Boolean) ?? [];
  const initialActors = sp.get("actor")?.split(",").filter(Boolean) ?? [];
  const initialKinds = (sp.get("kind")?.split(",").filter(Boolean) ?? []) as AuditKind[];
  const initialFrom = sp.get("from") ?? "";
  const initialTo = sp.get("to") ?? "";

  const [open, setOpen] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<string[]>(initialProjects);
  const [selectedActors, setSelectedActors] = useState<string[]>(initialActors);
  const [selectedKinds, setSelectedKinds] = useState<AuditKind[]>(initialKinds);
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

  const activeCount =
    (selectedProjects.length > 0 ? 1 : 0) +
    (selectedActors.length > 0 ? 1 : 0) +
    (selectedKinds.length > 0 ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0);

  function toggleIn<T extends string>(setter: (fn: (prev: T[]) => T[]) => void, value: T) {
    setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
  }

  function apply() {
    const params = new URLSearchParams();
    params.set("tab", "activity");
    if (selectedProjects.length > 0) params.set("project", selectedProjects.join(","));
    if (selectedActors.length > 0) params.set("actor", selectedActors.join(","));
    if (selectedKinds.length > 0) params.set("kind", selectedKinds.join(","));
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/history?${params.toString()}`);
    setOpen(false);
  }

  function clear() {
    setSelectedProjects([]);
    setSelectedActors([]);
    setSelectedKinds([]);
    setFrom("");
    setTo("");
    router.push("/history?tab=activity");
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
        <div className="absolute right-0 top-9 z-30 w-[26rem] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-card)]">
          <Section label="Event">
            <div className="max-h-44 overflow-y-auto rounded-md border border-[var(--color-line-soft)]">
              {KIND_GROUPS.map(g => (
                <div key={g.group}>
                  <div className="bg-[var(--color-surface-2)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
                    {g.group}
                  </div>
                  {g.kinds.map(k => (
                    <label
                      key={k}
                      className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[12.5px] hover:bg-[var(--color-surface-2)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedKinds.includes(k)}
                        onChange={() => toggleIn(setSelectedKinds, k)}
                      />
                      <span>{kindLabel(k)}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </Section>

          <Section label="Project">
            <div className="max-h-32 overflow-y-auto rounded-md border border-[var(--color-line-soft)]">
              {projects.length === 0 ? (
                <div className="px-2 py-1.5 text-[12px] text-[var(--color-text-3)]">No projects</div>
              ) : (
                projects.map(p => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[12.5px] hover:bg-[var(--color-surface-2)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjects.includes(p.id)}
                      onChange={() => toggleIn(setSelectedProjects, p.id)}
                    />
                    <span className="font-mono text-[11px] text-[var(--color-text-3)]">{p.code}</span>
                    <span className="truncate">{p.name}</span>
                  </label>
                ))
              )}
            </div>
          </Section>

          <Section label="Actor">
            <div className="max-h-28 overflow-y-auto rounded-md border border-[var(--color-line-soft)]">
              {actors.length === 0 ? (
                <div className="px-2 py-1.5 text-[12px] text-[var(--color-text-3)]">No actors yet</div>
              ) : (
                actors.map(a => (
                  <label
                    key={a.id}
                    className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[12.5px] hover:bg-[var(--color-surface-2)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedActors.includes(a.id)}
                      onChange={() => toggleIn(setSelectedActors, a.id)}
                    />
                    <span>{a.name ?? "—"}</span>
                  </label>
                ))
              )}
            </div>
          </Section>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <DateField label="From" value={from} onChange={setFrom} />
            <DateField label="To" value={to} onChange={setTo} />
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
        {label}
      </div>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
      />
    </label>
  );
}
