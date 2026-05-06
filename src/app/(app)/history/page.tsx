import { listExports } from "@/server/queries/exports";
import { listProjects } from "@/server/queries/projects";
import { PageHead } from "@/components/master/page-head";
import { HistoryTable } from "@/components/history/history-table";
import { HistoryFilters } from "@/components/history/history-filters";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const projectIds = sp.project?.split(",").filter(Boolean);
  const from = sp.from ? new Date(sp.from) : undefined;
  const to = sp.to ? endOfDay(sp.to) : undefined;

  const [rows, projects] = await Promise.all([
    listExports({ projectIds, from, to }),
    listProjects(),
  ]);

  return (
    <>
      <PageHead
        title="History"
        subtitle="All previously generated bills of materials. Re-download or audit."
        actions={
          <HistoryFilters
            projects={projects.map(p => ({ id: p.id, code: p.code, name: p.name }))}
          />
        }
      />
      <HistoryTable rows={rows as any} />
    </>
  );
}

function endOfDay(iso: string): Date | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return undefined;
  d.setHours(23, 59, 59, 999);
  return d;
}
