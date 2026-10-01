import ExcelJS from "exceljs";
import { DRAWING_STATUSES, DRAWING_STATUS_LABEL, formatDrawingRevision } from "./drawing-status";
import { isOverdueOn, type DashboardDrawing, type DrawingSummary, type GroupSummary } from "./drawing-dashboard";

export type ProjectReportRow = {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  ownerName: string | null;
  startDate: string | null;
  targetDate: string | null;
  bomCount: number;
  lineCount: number;
  revLetter: string | null;
};

export type DeadlineReportRow = { projectCode: string; projectName: string; label: string; date: string };

export type OutdatedBomRow = {
  projectCode: string;
  bomName: string;
  bomRevisionLetter: string;
  code: string;
  linkedNumber: number;
  latestNumber: number;
};

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF0F4" } };
const RED = { argb: "FFB91C1C" };

function addTable(
  ws: ExcelJS.Worksheet,
  startRow: number,
  headers: Array<{ header: string; width?: number; numeric?: boolean }>,
  rows: Array<Array<string | number | null>>,
): number {
  const head = ws.getRow(startRow);
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h.header;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: "thin", color: { argb: "FFC9CED8" } } };
    if (h.numeric) cell.alignment = { horizontal: "right" };
    const col = ws.getColumn(i + 1);
    if (h.width && (col.width ?? 0) < h.width) col.width = h.width;
  });
  rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri);
    r.forEach((v, ci) => {
      row.getCell(ci + 1).value = v ?? "";
    });
  });
  if (rows.length === 0) ws.getCell(startRow + 1, 1).value = "—";
  return startRow + Math.max(rows.length, 1) + 2;
}

function title(ws: ExcelJS.Worksheet, row: number, text: string) {
  ws.getCell(row, 1).value = text;
  ws.getCell(row, 1).font = { bold: true, size: 12 };
  return row + 1;
}

function groupRows(groups: GroupSummary[]) {
  return groups.map(g => [
    g.label,
    g.total,
    g.total - g.closed,
    g.closed,
    g.overdue,
    g.openRemarks,
    Math.round(g.estimatedHours * 10) / 10,
    Math.round(g.loggedHours * 10) / 10,
    g.total ? Math.round((g.closed / g.total) * 100) : 0,
  ]);
}

const GROUP_HEADERS = (first: string) => [
  { header: first, width: 26 },
  { header: "Drawings", width: 10, numeric: true },
  { header: "Open", width: 8, numeric: true },
  { header: "Approved", width: 10, numeric: true },
  { header: "Overdue", width: 10, numeric: true },
  { header: "Open remarks", width: 13, numeric: true },
  { header: "Est. hours", width: 11, numeric: true },
  { header: "Logged hours", width: 13, numeric: true },
  { header: "% approved", width: 11, numeric: true },
];

/** The dashboard as a workbook: key figures, projects & BOMs, deadlines, and the drawing sheets. */
export async function buildDashboardWorkbook(input: {
  scope: string;
  today: string;
  bom: { activeBoms: number; approvalsPending: number; avgLeadTimeDays: number };
  projects: ProjectReportRow[];
  deadlines: DeadlineReportRow[];
  drawings: DashboardDrawing[];
  summary: DrawingSummary;
  outdatedBoms: OutdatedBomRow[];
  openTransmittals: number;
}): Promise<Buffer> {
  const { summary: s, today } = input;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Revline";
  wb.created = new Date();

  // ── Summary ────────────────────────────────
  const sum = wb.addWorksheet("Summary");
  sum.getCell("A1").value = "Dashboard report";
  sum.getCell("A1").font = { bold: true, size: 18 };
  sum.getCell("A2").value = `${input.scope} · ${today}`;
  sum.getCell("A2").font = { color: { argb: "FF6B7180" } };

  let row = title(sum, 4, "Key figures");
  const overdueDates = input.deadlines.filter(d => d.date < today).length;
  const kpis: Array<[string, number | string]> = [
    ["Projects", input.projects.length],
    ["Active BOMs", input.bom.activeBoms],
    ["Approvals pending", input.bom.approvalsPending],
    ["Open deadlines (overdue)", `${input.deadlines.length} (${overdueDates})`],
    ["Avg. vendor lead time (days)", input.bom.avgLeadTimeDays],
    ["Drawings", s.totals.total],
    ["Approved (A / B / As Built)", `${s.totals.closed} (${s.totals.progressPct}%)`],
    ["Overdue", s.totals.overdue],
    ["Due in the next 7 days", s.totals.dueSoon],
    ["Waiting for internal approval", s.totals.inReview],
    ["Awaiting approval", s.totals.awaitingApproval],
    ["Open remarks", s.totals.openRemarks],
    ["Transmittals not acknowledged", input.openTransmittals],
    ["Estimated hours", Math.round(s.totals.estimatedHours * 10) / 10],
    ["Logged hours", Math.round(s.totals.loggedHours * 10) / 10],
    ["BOMs built from outdated drawings", input.outdatedBoms.length],
  ];
  row = addTable(sum, row, [{ header: "Figure", width: 34 }, { header: "Value", width: 14, numeric: true }], kpis);

  row = title(sum, row, "By status");
  row = addTable(
    sum,
    row,
    [{ header: "Status", width: 34 }, { header: "Drawings", width: 14, numeric: true }],
    DRAWING_STATUSES.map(st => [DRAWING_STATUS_LABEL[st], s.byStatus[st]]),
  );

  // ── Projects & BOMs ────────────────────────
  const drawingsByProject = new Map(s.byProject.map(g => [g.key, g]));
  const proj = wb.addWorksheet("Projects");
  addTable(
    proj,
    1,
    [
      { header: "Code", width: 12 },
      { header: "Project", width: 30 },
      { header: "Client", width: 26 },
      { header: "Manager", width: 20 },
      { header: "Start", width: 12 },
      { header: "Completion", width: 12 },
      { header: "BOMs", width: 8, numeric: true },
      { header: "BOM lines", width: 10, numeric: true },
      { header: "Current BOM rev", width: 15 },
      { header: "Drawings", width: 10, numeric: true },
      { header: "Approved drawings", width: 17, numeric: true },
      { header: "Overdue drawings", width: 16, numeric: true },
    ],
    input.projects.map(p => {
      const g = drawingsByProject.get(p.id);
      return [
        p.code,
        p.name,
        p.clientName,
        p.ownerName,
        p.startDate,
        p.targetDate,
        p.bomCount,
        p.lineCount,
        p.revLetter ? `Rev ${p.revLetter}` : null,
        g?.total ?? 0,
        g?.closed ?? 0,
        g?.overdue ?? 0,
      ];
    }),
  );
  proj.views = [{ state: "frozen", ySplit: 1 }];

  const dl = wb.addWorksheet("Deadlines");
  addTable(
    dl,
    1,
    [
      { header: "Date", width: 12 },
      { header: "Project", width: 12 },
      { header: "Project name", width: 30 },
      { header: "Deadline", width: 30 },
      { header: "Status", width: 10 },
    ],
    input.deadlines.map(d => [d.date, d.projectCode, d.projectName, d.label, d.date < today ? "Overdue" : ""]),
  );
  dl.eachRow((r, i) => {
    if (i > 1 && r.getCell(5).value === "Overdue") r.getCell(5).font = { color: RED, bold: true };
  });

  // ── Groupings ──────────────────────────────
  const groups = wb.addWorksheet("Drawings by project");
  addTable(groups, 1, GROUP_HEADERS("Project"), groupRows(s.byProject));
  const owners = wb.addWorksheet("By engineer");
  addTable(owners, 1, GROUP_HEADERS("Owner"), groupRows(s.byOwner));
  const disc = wb.addWorksheet("By discipline");
  addTable(disc, 1, GROUP_HEADERS("Discipline"), groupRows(s.byDiscipline));

  // ── Register ───────────────────────────────
  const reg = wb.addWorksheet("Drawing register");
  addTable(
    reg,
    1,
    [
      { header: "Project", width: 12 },
      { header: "Code", width: 14 },
      { header: "Name", width: 38 },
      { header: "Discipline", width: 16 },
      { header: "Rev", width: 7 },
      { header: "Status", width: 24 },
      { header: "Owner", width: 20 },
      { header: "Due", width: 12 },
      { header: "Overdue", width: 9 },
      { header: "Est. hours", width: 11, numeric: true },
      { header: "Logged hours", width: 13, numeric: true },
      { header: "Open remarks", width: 13, numeric: true },
    ],
    [...input.drawings]
      .sort((a, b) => a.projectCode.localeCompare(b.projectCode) || a.code.localeCompare(b.code))
      .map(d => [
        d.projectCode,
        d.code,
        d.name,
        d.disciplineName,
        formatDrawingRevision(d.revisionNumber),
        DRAWING_STATUS_LABEL[d.status],
        d.ownerName,
        d.dueDate,
        isOverdueOn(d, today) ? "Yes" : "",
        d.estimatedHours,
        Math.round(d.loggedHours * 100) / 100,
        d.openRemarks,
      ]),
  );
  reg.views = [{ state: "frozen", ySplit: 1 }];
  reg.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 12 } };
  reg.eachRow((r, i) => {
    if (i > 1 && r.getCell(9).value === "Yes") r.getCell(8).font = { color: RED, bold: true };
  });

  // ── Attention lists ────────────────────────
  const att = wb.addWorksheet("Needs attention");
  row = title(att, 1, "Overdue");
  row = addTable(
    att,
    row,
    [{ header: "Drawing", width: 16 }, { header: "Name", width: 38 }, { header: "Owner", width: 20 }, { header: "Due", width: 12 }, { header: "Days late", width: 10, numeric: true }],
    s.overdue.map(d => [`${d.projectCode} ${d.code}`, d.name, d.ownerName, d.dueDate, d.daysLate]),
  );
  row = title(att, row, "Waiting for internal approval");
  row = addTable(
    att,
    row,
    [{ header: "Drawing", width: 16 }, { header: "Name", width: 38 }, { header: "Approving engineer", width: 20 }, { header: "Since", width: 12 }, { header: "Days", width: 10, numeric: true }],
    s.reviewQueue.map(d => [`${d.projectCode} ${d.code}`, d.name, d.reviewerName, d.needApprovalSince, d.daysWaiting]),
  );
  row = title(att, row, "Over estimate");
  row = addTable(
    att,
    row,
    [{ header: "Drawing", width: 16 }, { header: "Name", width: 38 }, { header: "Est. hours", width: 20, numeric: true }, { header: "Logged hours", width: 12, numeric: true }],
    s.overBudget.map(d => [`${d.projectCode} ${d.code}`, d.name, d.estimatedHours, Math.round(d.loggedHours * 100) / 100]),
  );
  row = title(att, row, "BOMs built from outdated drawings");
  addTable(
    att,
    row,
    [{ header: "Project", width: 16 }, { header: "BOM", width: 38 }, { header: "BOM rev", width: 20 }, { header: "Drawing", width: 12 }, { header: "Built from", width: 10 }, { header: "Current", width: 10 }],
    input.outdatedBoms.map(b => [
      b.projectCode,
      b.bomName,
      b.bomRevisionLetter,
      b.code,
      formatDrawingRevision(b.linkedNumber),
      formatDrawingRevision(b.latestNumber),
    ]),
  );

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
