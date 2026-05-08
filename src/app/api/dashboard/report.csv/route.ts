import { NextResponse } from "next/server";
import { getStats, getProjectsForDashboard } from "@/server/queries/dashboard";

export async function GET() {
  const [stats, projects] = await Promise.all([getStats(), getProjectsForDashboard()]);

  const lines: string[] = [];
  lines.push("BOM Studio — Dashboard report");
  lines.push(`Generated,${new Date().toISOString()}`);
  lines.push("");
  lines.push("Stat,Value");
  lines.push(`Active BOMs,${stats.activeBoms}`);
  lines.push(`Approvals pending,${stats.approvalsPending}`);
  lines.push(`Avg. lead time (days),${stats.avgLeadTimeDays}`);
  lines.push("");
  lines.push("Project code,Project name,BOMs,Lines,Updated,Target");
  for (const p of projects as Array<{
    code: string;
    name: string;
    bomCount: number;
    lineCount: number;
    updatedAt: Date | string;
    targetDate: string | null;
  }>) {
    const safe = (s: string | null | undefined) => `"${(s ?? "").replace(/"/g, '""')}"`;
    lines.push([
      safe(p.code),
      safe(p.name),
      p.bomCount,
      p.lineCount,
      safe(new Date(p.updatedAt).toISOString()),
      safe(p.targetDate),
    ].join(","));
  }
  const body = lines.join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bom-studio-dashboard-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
