"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { Meter } from "@/components/dashboard/meter";
import { SELECT_CLASS, type DisciplineOption, type UserOption } from "@/components/drawings/drawing-form-fields";
import { setProjectDisciplines } from "@/server/actions/project-passport";
import type { ProjectDisciplineRow } from "@/server/queries/project-passport";

export type DisciplineStats = { total: number; closed: number; overdue: number };

function EditDisciplinesDialog({
  projectId,
  selected,
  options,
  users,
}: {
  projectId: string;
  selected: ProjectDisciplineRow[];
  options: DisciplineOption[];
  users: UserOption[];
}) {
  const initial = new Map(selected.map(d => [d.disciplineId, d.leadUserId ?? ""]));
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  const toggle = (id: string, on: boolean) =>
    setPicked(prev => {
      const next = new Map(prev);
      if (on) next.set(id, next.get(id) ?? "");
      else next.delete(id);
      return next;
    });

  const save = () =>
    start(async () => {
      const res = await setProjectDisciplines({
        projectId,
        items: [...picked].map(([disciplineId, lead]) => ({ disciplineId, leadUserId: lead || null })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Disciplines saved");
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) setPicked(new Map(initial));
      }}
    >
      <DialogTrigger
        render={
          <button type="button" className="btn btn-sm">
            <Icon.Edit className="ico" /> Edit
          </button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Project disciplines</DialogTitle>
          <DialogDescription>
            Tick the disciplines in scope and pick who leads each one. The list itself is managed in{" "}
            <Link href="/settings/drawings" className="underline">Settings → Drawings</Link>.
          </DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="muted m-0 text-[12.5px]">No disciplines defined yet.</p>
        ) : (
          <div className="grid max-h-[55vh] gap-1 overflow-y-auto">
            {options.map(d => {
              const on = picked.has(d.id);
              return (
                <div key={d.id} className="grid grid-cols-[1fr_220px] items-center gap-3 rounded px-2 py-1.5 hover:bg-[var(--color-surface-2)] max-[480px]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] max-[480px]:gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={on} onChange={e => toggle(d.id, e.target.checked)} />
                    {d.name}
                  </label>
                  <select
                    className={SELECT_CLASS}
                    value={picked.get(d.id) ?? ""}
                    disabled={!on}
                    aria-label={`Lead engineer for ${d.name}`}
                    onChange={e => setPicked(prev => new Map(prev).set(d.id, e.target.value))}
                  >
                    <option value="">— Lead engineer —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DisciplinesCard({
  projectId,
  disciplines,
  options,
  users,
  stats,
  readOnly = false,
}: {
  projectId: string;
  disciplines: ProjectDisciplineRow[];
  options: DisciplineOption[];
  users: UserOption[];
  /** Drawing counts keyed by discipline id. */
  stats: Record<string, DisciplineStats>;
  readOnly?: boolean;
}) {
  const inScope = new Set(disciplines.map(d => d.disciplineId));
  // Drawings filed under a discipline that isn't in the passport still show up, flagged.
  const extra = options.filter(o => !inScope.has(o.id) && stats[o.id]?.total);

  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="card-head max-[701px]:flex-wrap">
        <div className="min-w-0">
          <h3 className="card-title">Disciplines</h3>
          <p className="card-sub">Scope of the project, who leads each discipline, and drawing progress.</p>
        </div>
        <span className="spacer" />
        {!readOnly && (
          <EditDisciplinesDialog projectId={projectId} selected={disciplines} options={options} users={users} />
        )}
      </div>
      {disciplines.length === 0 && extra.length === 0 ? (
        <div className="muted px-4 py-3 text-[12.5px]">
          {readOnly ? "No disciplines yet." : "No disciplines yet — click Edit to set the scope."}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl tbl-list">
            <thead>
              <tr>
                <th>Discipline</th>
                <th>Lead engineer</th>
                <th className="num">Drawings</th>
                <th className="num">Overdue</th>
                <th style={{ minWidth: 150 }}>Approved</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...disciplines.map(d => ({ id: d.disciplineId, name: d.name, lead: d.leadName, inScope: true })),
                ...extra.map(o => ({ id: o.id, name: o.name, lead: null, inScope: false })),
              ].map(row => {
                const st = stats[row.id] ?? { total: 0, closed: 0, overdue: 0 };
                const pct = st.total ? Math.round((st.closed / st.total) * 100) : 0;
                return (
                  <tr key={row.id}>
                    <td className="l-title">
                      <span style={{ fontWeight: 500 }}>{row.name}</span>
                      {!row.inScope && <div className="muted" style={{ fontSize: 11 }}>has drawings, not in scope</div>}
                    </td>
                    <td className={row.lead ? "l-meta" : "l-hide"}>
                      <span className="min-[701px]:hidden">Lead </span>
                      {row.lead ?? <span className="muted">—</span>}
                    </td>
                    <td className="num l-meta">
                      {st.total}
                      <span className="min-[701px]:hidden"> drawing{st.total === 1 ? "" : "s"}</span>
                    </td>
                    <td className={`num ${st.overdue ? "l-meta" : "l-hide"}`} style={st.overdue ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                      {st.overdue}
                      <span className="min-[701px]:hidden"> overdue</span>
                    </td>
                    <td className={st.total ? "l-line" : "l-hide"}>
                      {st.total ? (
                        <div className="flex items-center gap-2">
                          <div style={{ flex: 1 }}>
                            <Meter value={st.closed} max={st.total} label={`${row.name}: ${st.closed} of ${st.total} drawings approved`} />
                          </div>
                          <span className="tabular text-[12px]">{pct}%</span>
                        </div>
                      ) : (
                        <span className="muted">No drawings</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
