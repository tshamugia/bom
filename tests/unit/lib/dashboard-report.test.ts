import { describe, expect, test } from "vitest";
import ExcelJS from "exceljs";
import { countDeadlines } from "@/lib/deadlines";
import { buildDashboardWorkbook } from "@/lib/dashboard-report-excel";
import { summarizeDrawings, type DashboardDrawing } from "@/lib/drawing-dashboard";

const TODAY = "2026-09-29";

describe("countDeadlines", () => {
  test("splits into overdue and the next 14 days, ignoring later dates", () => {
    const dates = ["2026-09-01", "2026-09-28", TODAY, "2026-10-13", "2026-10-14"].map(date => ({ date }));
    expect(countDeadlines(dates, TODAY)).toEqual({ overdue: 2, upcoming: 2 });
  });
});

describe("buildDashboardWorkbook", () => {
  test("has project, deadline and drawing sheets with the right rows", async () => {
    const drawing: DashboardDrawing = {
      id: "d1", code: "ELV-101", name: "CCTV", projectId: "p1", projectCode: "HLT", projectName: "Hilton",
      disciplineName: "CCTV", ownerId: "u1", ownerName: "Nino", revisionNumber: 2, status: "approved-a",
      reviewerName: null, dueDate: "2026-09-20", estimatedHours: 10, loggedHours: 12, openRemarks: 0, needApprovalSince: null,
    };
    const buf = await buildDashboardWorkbook({
      scope: "All projects",
      today: TODAY,
      bom: { activeBoms: 3, approvalsPending: 1, avgLeadTimeDays: 4.5 },
      projects: [{
        id: "p1", code: "HLT", name: "Hilton", clientName: "Hilton Tbilisi", ownerName: "Nino",
        startDate: "2026-01-10", targetDate: "2026-12-01", bomCount: 2, lineCount: 40, revLetter: "B",
      }],
      deadlines: [{ projectCode: "HLT", projectName: "Hilton", label: "Design submission", date: "2026-09-20" }],
      drawings: [drawing],
      summary: summarizeDrawings([drawing], TODAY),
      outdatedBoms: [],
      openTransmittals: 0,
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map(w => w.name)).toEqual([
      "Summary", "Projects", "Deadlines", "Drawings by project", "By engineer", "By discipline", "Drawing register", "Needs attention",
    ]);
    const projects = wb.getWorksheet("Projects")!;
    expect(projects.getRow(2).values).toEqual([
      undefined, "HLT", "Hilton", "Hilton Tbilisi", "Nino", "2026-01-10", "2026-12-01", 2, 40, "Rev B", 1, 1, 0,
    ]);
    expect(wb.getWorksheet("Deadlines")!.getCell("E2").value).toBe("Overdue");
    const summary = wb.getWorksheet("Summary")!;
    const figures = new Map<string, unknown>();
    summary.eachRow(r => figures.set(String(r.getCell(1).value), r.getCell(2).value));
    expect(figures.get("Active BOMs")).toBe(3);
    expect(figures.get("Drawings")).toBe(1);
  });
});
