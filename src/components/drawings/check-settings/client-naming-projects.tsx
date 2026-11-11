"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { setProjectClientNaming } from "@/server/actions/drawing-check-settings";
import { SELECT_CLASS } from "../drawing-form-fields";

type ProjectRow = { id: string; code: string; name: string; clientNaming: boolean };

/** Projects whose file names follow the client's naming (NAMING §1) — their checks skip the file-name rules. */
export function ClientNamingProjects({ projects }: { projects: ProjectRow[] }) {
  const [adding, setAdding] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const on = projects.filter(p => p.clientNaming);
  const off = projects.filter(p => !p.clientNaming);

  const set = (projectId: string, enabled: boolean) =>
    start(async () => {
      const res = await setProjectClientNaming({ projectId, enabled });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setAdding("");
      router.refresh();
    });

  return (
    <div className="grid gap-3 p-4">
      {on.length === 0 ? (
        <p className="muted m-0 text-[12.5px]">Every project follows the standard&apos;s file naming.</p>
      ) : (
        <ul className="m-0 grid list-none gap-0 p-0">
          {on.map(p => (
            <li key={p.id} className="flex items-center gap-2 py-2" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 text-[13px] hover:underline [overflow-wrap:anywhere]">
                <span className="mono">{p.code}</span> · {p.name}
              </Link>
              <Button size="sm" variant="outline" onClick={() => set(p.id, false)} disabled={pending}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
      {off.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${SELECT_CLASS} min-[701px]:!w-auto min-[701px]:max-w-[360px] flex-[1_1_220px]`}
            value={adding}
            onChange={e => setAdding(e.target.value)}
            aria-label="Project with the client's file naming"
          >
            <option value="">Add a project…</option>
            {off.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
          <Button onClick={() => set(adding, true)} disabled={pending || !adding}>Add</Button>
        </div>
      )}
    </div>
  );
}
