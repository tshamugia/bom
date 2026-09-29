import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/server/auth-context";
import { audit } from "@/server/audit";
import { getDashboardData } from "@/server/queries/dashboard-report";
import { buildDashboardWorkbook } from "@/lib/dashboard-report-excel";

/** Same numbers as /dashboard, as a workbook — streamed back, not stored. */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const d = await getDashboardData(req.nextUrl.searchParams.get("project"));
  const buf = await buildDashboardWorkbook({
    scope: d.project ? `${d.project.code} — ${d.project.name}` : "All projects",
    today: d.today,
    bom: d.stats,
    projects: d.projects,
    deadlines: d.deadlines,
    drawings: d.drawingData.drawings,
    summary: d.summary,
    outdatedBoms: d.drawingData.outdatedBoms,
    openTransmittals: d.drawingData.openTransmittals,
  });

  const scope = d.project ? d.project.code.replace(/[^\w.-]+/g, "_") : "All";
  const fileName = `Dashboard_${scope}_${d.today}.xlsx`;
  await audit({
    kind: "dashboard.report.exported",
    refType: d.project ? "project" : undefined,
    refId: d.project?.id,
    summary: `${fileName} exported`,
    payload: { projectId: d.project?.id ?? null, format: "xlsx" },
  });

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
