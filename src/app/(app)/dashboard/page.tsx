import { getStats, getRecentActivity, getProjectsForDashboard, getUpcomingDeadlines } from "@/server/queries/dashboard";
import { PageHead } from "@/components/master/page-head";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/dashboard/stat-tile";
import { ProjectsTable } from "@/components/dashboard/projects-table";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import Link from "next/link";

export default async function DashboardPage() {
  const [stats, activity, projects, deadlines] = await Promise.all([
    getStats(),
    getRecentActivity(8),
    getProjectsForDashboard(),
    getUpcomingDeadlines(4),
  ]);

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle="Active BOMs, recent activity, and procurement health."
        actions={
          <>
            <Link href="/api/dashboard/report.csv" className="btn">
              <Icon.Download className="ico" /> Export report
            </Link>
            <NewProjectDialog />
          </>
        }
      />

      <div className="stat-grid">
        <StatTile label="Active BOMs" value={stats.activeBoms} />
        <StatTile label="Avg. lead time" value={`${stats.avgLeadTimeDays}d`} />
        <StatTile
          label="Approvals pending"
          value={stats.approvalsPending}
          delta={stats.approvalsPending > 0 ? "needs action" : ""}
          deltaTone={stats.approvalsPending > 0 ? "down" : "neutral"}
        />
        <StatTile
          label="Upcoming deadlines"
          value={stats.upcomingDeadlines}
          delta={stats.overdueDeadlines > 0 ? `${stats.overdueDeadlines} overdue` : "next 14d"}
          deltaTone={stats.overdueDeadlines > 0 ? "down" : "neutral"}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <ProjectsTable rows={projects as React.ComponentProps<typeof ProjectsTable>["rows"]} />

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ActivityTimeline items={activity as React.ComponentProps<typeof ActivityTimeline>["items"]} />

          <div className="card">
            <div className="card-head"><h3 className="card-title">Upcoming deadlines</h3></div>
            <div style={{ padding: "4px 0" }}>
              {deadlines.length === 0 && (
                <div className="muted" style={{ padding: "12px 16px", fontSize: 12.5 }}>No target dates set.</div>
              )}
              {deadlines.map((d, i) => (
                <div
                  key={d.id}
                  style={{
                    padding: "10px 16px", display: "flex", alignItems: "center", gap: 10,
                    fontSize: 12.5,
                    borderBottom: i < deadlines.length - 1 ? "1px solid var(--line-soft)" : "none",
                  }}
                >
                  <Icon.Calendar className="ico" style={{ color: "var(--text-3)" }} />
                  <Link href={`/projects/${d.id}`} style={{ color: "inherit", flex: 1, minWidth: 0 }}>
                    <span className="mono" style={{ fontSize: 11.5 }}>{d.code}</span>
                    <span className="muted" style={{ marginLeft: 8 }}>{d.name}</span>
                  </Link>
                  <span className="muted tabular" style={{ textAlign: "right" }}>{d.targetDate}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
