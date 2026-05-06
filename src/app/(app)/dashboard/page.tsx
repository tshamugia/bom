import { getStats, getRecentActivity, getProjectsForDashboard } from "@/server/queries/dashboard";
import { PageHead } from "@/components/master/page-head";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/dashboard/stat-tile";
import { ProjectsTable } from "@/components/dashboard/projects-table";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import Link from "next/link";

export default async function DashboardPage() {
  const [stats, activity, projects] = await Promise.all([
    getStats(),
    getRecentActivity(8),
    getProjectsForDashboard(),
  ]);

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle="Active BOMs, recent activity, and procurement health."
        actions={
          <>
            <Link href="/api/dashboard/report.csv">
              <Button variant="outline"><Icon.Download size={14} className="mr-1.5" /> Export report</Button>
            </Link>
            <Link href="/builder">
              <Button><Icon.Plus size={14} className="mr-1.5" /> New BOM</Button>
            </Link>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatTile tone="accent"  label="Active BOMs"       value={stats.activeBoms} />
        <StatTile tone="info"    label="Avg. lead time"    value={`${stats.avgLeadTimeDays}d`} delta="±0.0d" deltaTone="neutral" />
        <StatTile tone="warning" label="Approvals pending" value={stats.approvalsPending} delta={stats.approvalsPending > 0 ? "needs action" : ""} deltaTone={stats.approvalsPending > 0 ? "down" : "neutral"} />
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-4">
        <ProjectsTable rows={projects as any} />
        <div className="flex flex-col gap-3">
          <ActivityTimeline items={activity as any} />
        </div>
      </div>
    </>
  );
}
