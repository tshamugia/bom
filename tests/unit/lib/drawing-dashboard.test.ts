import { describe, expect, test } from "vitest";
import { summarizeDrawings, type DashboardDrawing } from "@/lib/drawing-dashboard";

const TODAY = "2026-09-29";

let n = 0;
function d(overrides: Partial<DashboardDrawing> = {}): DashboardDrawing {
  n++;
  return {
    id: `d${n}`,
    code: `ELV-${n}`,
    name: `Drawing ${n}`,
    projectId: "p1",
    projectCode: "HLT",
    projectName: "Hilton",
    disciplineName: "ELV",
    ownerId: "u1",
    ownerName: "Nino",
    revisionNumber: 1,
    status: "in-progress",
    reviewerName: null,
    dueDate: null,
    estimatedHours: null,
    loggedHours: 0,
    openRemarks: 0,
    needApprovalSince: null,
    ...overrides,
  };
}

describe("summarizeDrawings", () => {
  test("totals, progress and hours", () => {
    const s = summarizeDrawings(
      [
        d({ status: "approved-a", estimatedHours: 10, loggedHours: 12 }),
        d({ status: "as-built", estimatedHours: 5, loggedHours: 4 }),
        d({ status: "in-progress", openRemarks: 2 }),
        d({ status: "need-approval", needApprovalSince: "2026-09-25", reviewerName: "Giorgi" }),
      ],
      TODAY,
    );
    expect(s.totals).toMatchObject({
      total: 4, closed: 2, open: 2, progressPct: 50, inReview: 1, openRemarks: 2, estimatedHours: 15, loggedHours: 16,
    });
    expect(s.reviewQueue[0]).toMatchObject({ daysWaiting: 4, reviewerName: "Giorgi" });
    expect(s.overBudget.map(x => x.overBy)).toEqual([2]);
  });

  test("overdue excludes closed drawings and sorts by lateness; due soon is a 7-day window", () => {
    const s = summarizeDrawings(
      [
        d({ code: "A", dueDate: "2026-09-28" }),
        d({ code: "B", dueDate: "2026-09-20" }),
        d({ code: "C", dueDate: "2026-09-01", status: "approved-b" }),
        d({ code: "D", dueDate: "2026-10-06" }),
        d({ code: "E", dueDate: "2026-10-07" }),
        d({ code: "F", dueDate: TODAY }),
      ],
      TODAY,
    );
    expect(s.overdue.map(x => [x.code, x.daysLate])).toEqual([["B", 9], ["A", 1]]);
    expect(s.dueSoon.map(x => [x.code, x.daysLeft])).toEqual([["F", 0], ["D", 7]]);
  });

  test("groups by project, discipline and owner", () => {
    const s = summarizeDrawings(
      [
        d({ projectId: "p2", projectCode: "ZED", status: "approved-a" }),
        d({ projectId: "p1", projectCode: "HLT", dueDate: "2026-09-01" }),
        d({ projectId: "p1", projectCode: "HLT", disciplineName: null, ownerId: null, ownerName: null }),
      ],
      TODAY,
    );
    expect(s.byProject.map(g => [g.label, g.total, g.closed, g.overdue])).toEqual([["HLT", 2, 0, 1], ["ZED", 1, 1, 0]]);
    expect(s.byDiscipline.find(g => g.label === "No discipline")?.total).toBe(1);
    expect(s.byOwner[0]).toMatchObject({ label: "Nino", total: 2 });
  });
});
