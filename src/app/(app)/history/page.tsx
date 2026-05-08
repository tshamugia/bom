import { listExports } from "@/server/queries/exports";
import { listProjects } from "@/server/queries/projects";
import { listActivity, listActivityActors, type AuditKind } from "@/server/queries/audit";
import { PageHead } from "@/components/master/page-head";
import { HistoryTable } from "@/components/history/history-table";
import { HistoryFilters } from "@/components/history/history-filters";
import { ActivityTable } from "@/components/history/activity-table";
import { ActivityFilters } from "@/components/history/activity-filters";
import { HistoryTabs, type HistoryTab } from "@/components/history/history-tabs";

type SP = {
  tab?: string;
  project?: string;
  actor?: string;
  kind?: string;
  from?: string;
  to?: string;
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const tab: HistoryTab = sp.tab === "activity" ? "activity" : "exports";
  const projectIds = sp.project?.split(",").filter(Boolean);
  const from = sp.from ? new Date(sp.from) : undefined;
  const to = sp.to ? endOfDay(sp.to) : undefined;

  const projects = await listProjects();
  const projectOptions = projects.map(p => ({ id: p.id, code: p.code, name: p.name }));

  const queryString = buildQuery(sp);

  return (
    <>
      <PageHead
        title="History"
        subtitle={
          tab === "exports"
            ? "Generated bills of materials. Re-download or audit."
            : "Everything that has happened in the workspace — commits, approvals, edits, exports."
        }
        actions={
          tab === "exports" ? (
            <HistoryFilters projects={projectOptions} />
          ) : (
            <ActivitySidecar projectOptions={projectOptions} />
          )
        }
      />
      <HistoryTabs active={tab} query={queryString} />
      {tab === "exports" ? (
        <ExportsPanel projectIds={projectIds} from={from} to={to} />
      ) : (
        <ActivityPanel
          projectIds={projectIds}
          actorIds={sp.actor?.split(",").filter(Boolean)}
          kinds={sp.kind?.split(",").filter(Boolean) as AuditKind[] | undefined}
          from={from}
          to={to}
        />
      )}
    </>
  );
}

async function ExportsPanel({
  projectIds,
  from,
  to,
}: {
  projectIds?: string[];
  from?: Date;
  to?: Date;
}) {
  const rows = await listExports({ projectIds, from, to });
  return <HistoryTable rows={rows as React.ComponentProps<typeof HistoryTable>["rows"]} />;
}

async function ActivityPanel({
  projectIds,
  actorIds,
  kinds,
  from,
  to,
}: {
  projectIds?: string[];
  actorIds?: string[];
  kinds?: AuditKind[];
  from?: Date;
  to?: Date;
}) {
  const { rows } = await listActivity({ projectIds, actorIds, kinds, from, to });
  return <ActivityTable rows={rows} />;
}

async function ActivitySidecar({
  projectOptions,
}: {
  projectOptions: Array<{ id: string; code: string; name: string }>;
}) {
  const actors = await listActivityActors();
  return <ActivityFilters projects={projectOptions} actors={actors} />;
}

function buildQuery(sp: SP): string {
  const params = new URLSearchParams();
  if (sp.project) params.set("project", sp.project);
  if (sp.actor) params.set("actor", sp.actor);
  if (sp.kind) params.set("kind", sp.kind);
  if (sp.from) params.set("from", sp.from);
  if (sp.to) params.set("to", sp.to);
  return params.toString();
}

function endOfDay(iso: string): Date | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return undefined;
  d.setHours(23, 59, 59, 999);
  return d;
}
