import { describe, expect, test } from "vitest";
import { sharedTimeFootnote, summarizeDrawings, type DashboardDrawing, type SharedTimeEntry } from "@/lib/drawing-dashboard";

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
    revisionNumber: 1, revisionLabel: "P01",
    status: "in-progress",
    reviewerName: null,
    dueDate: null,
    estimatedHours: null,
    loggedHours: 0,
    sharedHours: 0,
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

// Issue #17: A–D share one 5 h entry; A 2 h, B 1 h and D 3 h are their own.
describe("summarizeDrawings with shared time", () => {
  const project = (id: string, code: string) => ({ projectId: id, projectCode: code, projectName: code });
  const A = d({ id: "A", ...project("p1", "HLT"), estimatedHours: 2, loggedHours: 2, sharedHours: 5, ownerId: "u1", ownerName: "Nino" });
  const B = d({ id: "B", ...project("p1", "HLT"), estimatedHours: 1, loggedHours: 1, sharedHours: 5, ownerId: "u2", ownerName: "Giorgi" });
  const C = d({ id: "C", ...project("p1", "HLT"), loggedHours: 0, sharedHours: 5 });
  const D = d({ id: "D", ...project("p1", "HLT"), loggedHours: 3, sharedHours: 5, disciplineName: "Fire" });
  const other = d({ id: "Z", ...project("p2", "ZED"), loggedHours: 4 });
  const shared: SharedTimeEntry[] = [{ id: "s1", projectId: "p1", hours: 5, drawingIds: ["A", "B", "C", "D"] }];

  test("the shared entry counts once in the project and overall totals: 6 + 5 = 11, not 26", () => {
    const s = summarizeDrawings([A, B, C, D, other], TODAY, shared);
    expect(s.totals).toMatchObject({ loggedHours: 6 + 4 + 5, sharedHours: 5, sharedEntries: 1 });
    expect(s.byProject.map(g => [g.label, g.loggedHours, g.sharedHours])).toEqual([["HLT", 11, 5], ["ZED", 4, 0]]);
  });

  test("a drawing's logged hours, estimate check and over-budget list ignore shared time", () => {
    const s = summarizeDrawings([A, B, C, D], TODAY, shared);
    // A and B are exactly on estimate with their own hours; 5 h shared would push them over.
    expect(s.overBudget).toEqual([]);
    expect([A, B, C, D].map(x => x.loggedHours)).toEqual([2, 1, 0, 3]);
  });

  test("owner and discipline groups show each drawing's own hours only", () => {
    const s = summarizeDrawings([A, B, C, D], TODAY, shared);
    expect(s.byOwner.find(g => g.label === "Nino")).toMatchObject({ loggedHours: 2 + 0 + 3, sharedHours: 0 });
    expect(s.byOwner.find(g => g.label === "Giorgi")).toMatchObject({ loggedHours: 1, sharedHours: 0 });
    expect(s.byDiscipline.reduce((n, g) => n + g.loggedHours, 0)).toBe(6);
    expect(s.byDiscipline.every(g => g.sharedHours === 0)).toBe(true);
  });

  test("a filtered list counts the entry once while one of its drawings is on it", () => {
    expect(summarizeDrawings([C], TODAY, shared).totals).toMatchObject({ loggedHours: 5, sharedHours: 5 });
    expect(summarizeDrawings([B, D], TODAY, shared).totals).toMatchObject({ loggedHours: 1 + 3 + 5, sharedHours: 5 });
    expect(summarizeDrawings([other], TODAY, shared).totals).toMatchObject({ loggedHours: 4, sharedHours: 0, sharedEntries: 0 });
  });

  test("archived drawings drop out; the entry goes once all its drawings are archived", () => {
    // The list holds live drawings only and the loader drops archived ones from `drawingIds`.
    const someArchived: SharedTimeEntry[] = [{ ...shared[0], drawingIds: ["C"] }];
    expect(summarizeDrawings([C, other], TODAY, someArchived).totals.sharedHours).toBe(5);
    const allArchived: SharedTimeEntry[] = [{ ...shared[0], drawingIds: [] }];
    expect(summarizeDrawings([other], TODAY, allArchived).totals).toMatchObject({ loggedHours: 4, sharedHours: 0 });
  });

  test("each entry counts once even if it is passed twice, and several entries add up", () => {
    const twice = [...shared, ...shared, { id: "s2", projectId: "p1", hours: 1.5, drawingIds: ["A", "C"] }];
    expect(summarizeDrawings([A, B, C, D], TODAY, twice).totals).toMatchObject({ sharedHours: 6.5, sharedEntries: 2 });
  });

  test("a drawing moved to another project books the entry to a project it still covers on the list", () => {
    const moved = { ...D, ...project("p2", "ZED") };
    const s = summarizeDrawings([moved, other], TODAY, shared);
    expect(s.byProject.map(g => [g.label, g.sharedHours])).toEqual([["ZED", 5]]);
    expect(s.totals.sharedHours).toBe(5);
  });

  test("the owner and discipline note appears only when there is shared time", () => {
    expect(sharedTimeFootnote(0, "owner")).toBeUndefined();
    expect(sharedTimeFootnote(5, "discipline")).toMatch(/isn't split by discipline/);
  });
});
