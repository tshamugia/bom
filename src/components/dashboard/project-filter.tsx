"use client";

import { useRouter } from "next/navigation";

export type ProjectFilterOption = { id: string; code: string; name: string };

export function DashboardProjectFilter({ projects, value }: { projects: ProjectFilterOption[]; value: string }) {
  const router = useRouter();
  return (
    <select
      className="select"
      style={{ width: "auto", minWidth: 180, maxWidth: 260 }}
      value={value}
      aria-label="Project"
      onChange={e => {
        const p = e.target.value;
        router.replace(p ? `/dashboard?project=${p}` : "/dashboard");
      }}
    >
      <option value="">All projects</option>
      {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
    </select>
  );
}
