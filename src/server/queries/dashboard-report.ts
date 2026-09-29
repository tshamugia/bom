import "server-only";
import { summarizeDrawings } from "@/lib/drawing-dashboard";
import { todayIso } from "@/lib/drawing-status";
import { getDrawingDashboard } from "./drawing-dashboard";
import { listProjectOptions } from "./drawings";
import { getProjectsForDashboard, getStats, listDeadlines } from "./dashboard";

/** Everything the dashboard shows, for one project or all — shared by the page, Excel and PDF. */
export async function getDashboardData(projectIdParam?: string | null) {
  const projectOptions = await listProjectOptions();
  const project = projectOptions.find(p => p.id === projectIdParam) ?? null;
  const projectId = project?.id;

  const [stats, allProjects, deadlines, drawingData] = await Promise.all([
    getStats({ projectId }),
    getProjectsForDashboard(),
    listDeadlines({ projectId }),
    getDrawingDashboard({ projectId }),
  ]);
  const today = todayIso();
  return {
    today,
    project,
    projectOptions,
    stats,
    projects: projectId ? allProjects.filter(p => p.id === projectId) : allProjects,
    deadlines,
    drawingData,
    summary: summarizeDrawings(drawingData.drawings, today),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
