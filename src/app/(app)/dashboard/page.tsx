import Link from "next/link";
import { getRecentActivity } from "@/server/queries/dashboard";
import { getDashboardData } from "@/server/queries/dashboard-report";
import { PageHead } from "@/components/master/page-head";
import { Icon } from "@/components/icons";
import { StatTile } from "@/components/dashboard/stat-tile";
import { ProjectsTable } from "@/components/dashboard/projects-table";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { DeadlinesCard } from "@/components/dashboard/deadlines-card";
import { DashboardProjectFilter } from "@/components/dashboard/project-filter";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import {
  DueSoonTable, GroupTable, OutdatedBomTable, OverBudgetTable, OverdueTable,
  ProjectTable, ReviewQueueTable, StatusBars,
} from "@/components/drawings/dashboard-parts";
import { DUE_SOON_DAYS } from "@/lib/drawing-dashboard";
import { DEADLINE_WINDOW_DAYS, countDeadlines } from "@/lib/deadlines";
import { roundHours } from "@/lib/drawing-meta";
import { formatDate } from "@/lib/format";
import { canEdit } from "@/lib/roles";
import { requireSession } from "@/server/auth-context";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{children}</h2>;
}

function Section({ title, sub, count, children }: { title: string; sub?: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="card-head">
        <div>
          <h3 className="card-title">{title}</h3>
          {sub && <p className="card-sub">{sub}</p>}
        </div>
        <span className="spacer" />
        {count !== undefined && <span className="pill tabular">{count}</span>}
      </div>
      {children}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const sp = await searchParams;
  const [session, data] = await Promise.all([requireSession(), getDashboardData(sp.project)]);
  const readOnly = !canEdit(session.user);
  const { today, project, projectOptions, stats, projects, deadlines, drawingData, summary: s } = data;
  const activity = await getRecentActivity(8, project?.id);
  const t = s.totals;
  const { upcoming: upcomingDates, overdue: overdueDates } = countDeadlines(deadlines, today);
  const oldestWait = s.reviewQueue[0]?.daysWaiting ?? 0;
  const overHours = t.estimatedHours > 0 && t.loggedHours > t.estimatedHours;
  const qs = project ? `?project=${project.id}` : "";

  return (
    <>
      <PageHead
        title="Dashboard"
        subtitle={`${project ? `${project.code} — ${project.name}` : "All projects"} · BOMs, drawings and deadlines · as of ${formatDate(today)}`}
        actions={
          <>
            <DashboardProjectFilter projects={projectOptions} value={project?.id ?? ""} />
            <a href={`/api/dashboard/report.xlsx${qs}`} className="btn">
              <Icon.Sheet className="ico" /> Excel
            </a>
            <a href={`/reports/dashboard${qs}`} target="_blank" rel="noopener" className="btn">
              <Icon.Print className="ico" /> PDF
            </a>
            {!readOnly && <NewProjectDialog />}
          </>
        }
      />

      <SectionTitle>Projects &amp; BOMs</SectionTitle>
      <div className="stat-grid">
        <StatTile label="Active BOMs" value={stats.activeBoms} />
        <StatTile
          label="Approvals pending"
          value={stats.approvalsPending}
          delta={stats.approvalsPending > 0 ? "needs action" : ""}
          deltaTone={stats.approvalsPending > 0 ? "down" : "neutral"}
        />
        <StatTile
          label="Deadlines"
          value={upcomingDates}
          delta={overdueDates > 0 ? `${overdueDates} overdue` : `next ${DEADLINE_WINDOW_DAYS}d`}
          deltaTone={overdueDates > 0 ? "down" : "neutral"}
        />
        <StatTile label="Avg. lead time" value={`${stats.avgLeadTimeDays}d`} />
      </div>

      <SectionTitle>Drawings</SectionTitle>
      <div className="stat-grid">
        <StatTile label="Drawings" value={t.total} delta={t.total ? `${t.progressPct}% approved` : ""} />
        <StatTile
          label="Overdue"
          value={t.overdue}
          delta={t.overdue ? "needs action" : ""}
          deltaTone={t.overdue ? "down" : "neutral"}
        />
        <StatTile
          label="Internal approval"
          value={t.inReview}
          delta={oldestWait ? `oldest ${oldestWait}d` : ""}
          deltaTone={oldestWait >= 3 ? "down" : "neutral"}
        />
        <StatTile label="Awaiting approval" value={t.awaitingApproval} />
        <StatTile label="Open remarks" value={t.openRemarks} />
        <StatTile label="Transmittals not acknowledged" value={drawingData.openTransmittals} />
        <StatTile
          label="Hours logged"
          value={roundHours(t.loggedHours)}
          delta={t.estimatedHours ? `of ${roundHours(t.estimatedHours)} est.` : ""}
          deltaTone={overHours ? "down" : "neutral"}
        />
        <StatTile
          label="Outdated BOM links"
          value={drawingData.outdatedBoms.length}
          delta={drawingData.outdatedBoms.length ? "BOMs to update" : ""}
          deltaTone={drawingData.outdatedBoms.length ? "down" : "neutral"}
        />
      </div>

      <div className="grid gap-4">
        <div className="dash-main">
          <ProjectsTable rows={projects} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <DeadlinesCard deadlines={deadlines} today={today} readOnly={readOnly} />
            <ActivityTimeline items={activity as React.ComponentProps<typeof ActivityTimeline>["items"]} />
          </div>
        </div>

        {t.total > 0 && (
          <>
            <div className="grid-2" style={{ alignItems: "start", gap: 16 }}>
              <Section title="Drawing status" sub="Latest revision of each drawing." count={t.total}>
                <StatusBars counts={s.byStatus} total={t.total} />
              </Section>
              <Section title="Waiting for internal approval" sub="Sent to a second engineer, longest wait first." count={s.reviewQueue.length}>
                <ReviewQueueTable rows={s.reviewQueue} />
              </Section>
            </div>

            {!project && (
              <Section title="Drawings by project" count={s.byProject.length}>
                <ProjectTable groups={s.byProject} projectHref={id => `/dashboard?project=${id}`} />
              </Section>
            )}

            <div className="grid-2" style={{ alignItems: "start", gap: 16 }}>
              <Section title="Overdue drawings" count={s.overdue.length}>
                <OverdueTable rows={s.overdue} />
              </Section>
              <Section title={`Drawings due in the next ${DUE_SOON_DAYS} days`} count={s.dueSoon.length}>
                <DueSoonTable rows={s.dueSoon} />
              </Section>
            </div>

            <div className="grid-2" style={{ alignItems: "start", gap: 16 }}>
              <Section title="Engineers" sub="Drawings by owner, busiest first.">
                <GroupTable groups={s.byOwner} title="Owner" />
              </Section>
              <Section title="Disciplines">
                <GroupTable groups={s.byDiscipline} title="Discipline" />
              </Section>
            </div>

            <div className="grid-2" style={{ alignItems: "start", gap: 16 }}>
              <Section title="Over estimate" sub="Logged hours above the planned estimate." count={s.overBudget.length}>
                <OverBudgetTable rows={s.overBudget} />
              </Section>
              <Section
                title="BOMs built from outdated drawings"
                sub="The BOM's current revision references an older drawing revision."
                count={drawingData.outdatedBoms.length}
              >
                <OutdatedBomTable rows={drawingData.outdatedBoms} />
              </Section>
            </div>
          </>
        )}
        {t.total === 0 && (
          <div className="card">
            <div className="muted" style={{ padding: "24px 16px", textAlign: "center", fontSize: 12.5 }}>
              No drawings {project ? `in ${project.code}` : "yet"}
              {!readOnly && <> — add them from the <Link href="/drawings" className="underline">drawing register</Link></>}.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
