import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth-context";
import { listAuditLog, listActivityActors, type AuditKind } from "@/server/queries/audit";
import { listProjects } from "@/server/queries/projects";
import { PageHead } from "@/components/master/page-head";
import { ActivityFilters } from "@/components/history/activity-filters";
import { KIND_GROUPS } from "@/components/history/activity-table";
import { AuditLogTable } from "@/components/audit/audit-log-table";
import { AUDIT_PRESETS, type AuditPreset } from "@/lib/audit-kinds";
import { isAdmin } from "@/lib/roles";

const PAGE_SIZE = 100;

type SP = {
  preset?: string;
  project?: string;
  actor?: string;
  kind?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireSession();
  if (!isAdmin(session.user)) redirect("/dashboard");

  const sp = await searchParams;
  const preset = AUDIT_PRESETS.find(p => p.id === sp.preset) ?? AUDIT_PRESETS[0];
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pickedKinds = sp.kind?.split(",").filter(Boolean) as AuditKind[] | undefined;
  // Kinds picked in the filter narrow the tab; they never widen it.
  const kinds = preset.kinds
    ? pickedKinds?.length
      ? pickedKinds.filter(k => preset.kinds!.includes(k))
      : [...preset.kinds]
    : pickedKinds;
  const from = sp.from ? new Date(sp.from) : undefined;
  const to = sp.to ? endOfDay(sp.to) : undefined;

  const [{ rows, nextCursor }, actors, projects] = await Promise.all([
    // An empty kind list after narrowing means nothing can match.
    kinds && kinds.length === 0
      ? Promise.resolve({ rows: [], nextCursor: null })
      : listAuditLog({
          kinds,
          actorIds: sp.actor?.split(",").filter(Boolean),
          projectIds: sp.project?.split(",").filter(Boolean),
          from: from && !Number.isNaN(from.valueOf()) ? from : undefined,
          to,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
    listActivityActors(),
    listProjects(),
  ]);

  const baseParams: Record<string, string> = preset.id === "all" ? {} : { preset: preset.id };
  const kindGroups = preset.kinds
    ? KIND_GROUPS
        .map(g => ({ group: g.group, kinds: g.kinds.filter(k => preset.kinds!.includes(k)) }))
        .filter(g => g.kinds.length > 0)
    : KIND_GROUPS;

  return (
    <>
      <PageHead
        title="Audit log"
        subtitle="Sign-ins, password resets, role changes, settings and deletions — every event in the workspace. Visible to admins only."
        actions={
          <ActivityFilters
            key={preset.id}
            projects={projects.map(p => ({ id: p.id, code: p.code, name: p.name }))}
            actors={actors}
            basePath="/audit"
            baseParams={baseParams}
            kindGroups={kindGroups}
          />
        }
      />

      <div className="tabs tabs-scroll">
        {AUDIT_PRESETS.map(p => (
          <Link
            key={p.id}
            href={presetHref(p.id)}
            className={`tab ${p.id === preset.id ? "active" : ""}`}
            scroll={false}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <AuditLogTable rows={rows} />

      {(page > 1 || nextCursor) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
          <span className="text-[var(--color-text-3)]">
            Page {page} · {PAGE_SIZE} per page
          </span>
          <div className="flex gap-3">
            {page > 1 && <Link href={pageHref(sp, page - 1)}>← Newer</Link>}
            {nextCursor && <Link href={pageHref(sp, page + 1)}>Older →</Link>}
          </div>
        </div>
      )}
    </>
  );
}

function presetHref(id: AuditPreset) {
  return id === "all" ? "/audit" : `/audit?preset=${id}`;
}

function pageHref(sp: SP, page: number) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") params.set(k, v);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/audit?${qs}` : "/audit";
}

function endOfDay(iso: string): Date | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return undefined;
  d.setHours(23, 59, 59, 999);
  return d;
}
