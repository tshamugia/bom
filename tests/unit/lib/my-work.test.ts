import { describe, expect, test } from "vitest";
import {
  MY_WORK_FIRST_VISIT_DAYS,
  bellCount,
  collectDeadlines,
  collectWaiting,
  countMyWork,
  describeUpdate,
  dueLabel,
  groupBomTasks,
  updatesSince,
  type MyDrawing,
  type ProjectDate,
  type RawUpdate,
} from "@/lib/my-work";

const TODAY = "2026-10-20";

function drawing(over: Partial<MyDrawing> = {}): MyDrawing {
  return {
    id: "d1",
    code: "CC-001",
    name: "Cameras",
    projectCode: "BS-001",
    revisionNumber: 1,
    status: "in-progress",
    dueDate: null,
    reviewerName: null,
    waitingSince: null,
    ...over,
  };
}

function projectDate(over: Partial<ProjectDate> = {}): ProjectDate {
  return { key: "m1", projectId: "p1", projectCode: "BS-001", projectName: "BMW showroom", label: "Handover", date: TODAY, ...over };
}

describe("collectDeadlines", () => {
  test("lists late and soon-due open drawings and near project dates, earliest first", () => {
    const items = collectDeadlines(
      [
        drawing({ id: "late", dueDate: "2026-10-15" }),
        drawing({ id: "soon", dueDate: "2026-10-30" }),
        drawing({ id: "far", dueDate: "2026-11-20" }),
        drawing({ id: "done", dueDate: "2026-10-10", status: "approved-a" }),
        drawing({ id: "none", dueDate: null }),
      ],
      [
        projectDate({ key: "m-late", date: "2026-10-01" }),
        projectDate({ key: "m-month", date: "2026-11-15" }),
        projectDate({ key: "m-far", date: "2026-12-31" }),
      ],
      TODAY,
    );
    expect(items.map(i => i.key)).toEqual(["m-late", "d:late", "d:soon", "m-month"]);
  });
});

describe("collectWaiting", () => {
  test("keeps drawings sent for approval, longest wait first", () => {
    const rows = collectWaiting(
      [
        drawing({ id: "a", status: "need-approval", waitingSince: "2026-10-18" }),
        drawing({ id: "b", status: "awaiting-approval", waitingSince: "2026-10-10" }),
        drawing({ id: "c", status: "in-progress" }),
        drawing({ id: "d", status: "need-approval", waitingSince: null }),
      ],
      TODAY,
    );
    expect(rows.map(r => [r.drawing.id, r.days, r.internal])).toEqual([
      ["b", 10, false],
      ["a", 2, true],
      ["d", null, true],
    ]);
  });
});

test("dueLabel reads late, today and days left", () => {
  expect(dueLabel("2026-10-17", TODAY)).toEqual({ text: "3d late", tone: "red" });
  expect(dueLabel(TODAY, TODAY)).toEqual({ text: "Today", tone: "amber" });
  expect(dueLabel("2026-10-22", TODAY)).toEqual({ text: "2d", tone: "amber" });
  expect(dueLabel("2026-10-27", TODAY)).toEqual({ text: "7d", tone: "" });
});

test("counts add up to the bell: to do + overdue + new updates", () => {
  const deadlines = collectDeadlines(
    [drawing({ id: "late", dueDate: "2026-10-01" }), drawing({ id: "soon", dueDate: "2026-10-25" })],
    [],
    TODAY,
  );
  const counts = countMyWork({ approvals: 2, receipts: 1, remarks: 1, boms: 0, deadlines, newUpdates: 3, today: TODAY });
  expect(counts).toEqual({
    approvals: 2, receipts: 1, remarks: 1, boms: 0, todo: 4, overdue: 1, dueSoon: 1, newUpdates: 3,
  });
  expect(bellCount(counts)).toBe(8);
});

test("groupBomTasks gives one task per BOM with each outdated drawing once", () => {
  const ref = {
    bomId: "b1", bomName: "Main BOM", projectId: "p1", projectCode: "BS-001", bomRevisionLetter: "2",
    drawingId: "d2", code: "CC-002", linkedNumber: 1, latestNumber: 3,
  };
  const tasks = groupBomTasks([
    ref,
    { ...ref, drawingId: "d1", code: "CC-001", linkedNumber: 2, latestNumber: 4 },
    { ...ref },
    { ...ref, bomId: "b0", bomName: "Aux BOM" },
  ]);
  expect(tasks.map(t => [t.bomName, t.drawings.map(d => d.code)])).toEqual([
    ["Aux BOM", ["CC-002"]],
    ["Main BOM", ["CC-001", "CC-002"]],
  ]);
});

test("someone who never opened My work sees the last week as new", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  expect(updatesSince(null, now).getTime()).toBe(now.getTime() - MY_WORK_FIRST_VISIT_DAYS * 86_400_000);
  const seen = new Date("2026-10-19T08:00:00Z");
  expect(updatesSince(seen, now)).toBe(seen);
});

describe("describeUpdate", () => {
  const at = new Date("2026-10-20T08:00:00Z");
  const event = (over: Partial<Extract<RawUpdate, { source: "drawing-event" }>> = {}): RawUpdate => ({
    source: "drawing-event",
    id: "event:1",
    at,
    actorName: "Nino",
    projectCode: "BS-001",
    kind: "comment",
    drawingId: "d1",
    code: "CC-001",
    name: "Cameras",
    revisionNumber: 2,
    fromStatus: null,
    toStatus: null,
    body: "Check the lens",
    reviewerIsMe: false,
    ...over,
  });

  test("a comment links to the drawing's revisions", () => {
    expect(describeUpdate(event())).toMatchObject({
      kind: "comment", actorName: "Nino", verb: "commented on", subject: "CC-001", subjectRev: "rev2",
      body: "Check the lens", context: "BS-001 · Cameras", href: "/drawings/d1#revisions",
    });
  });

  test("status changes read as a request, an approval, a send-back or a plain change", () => {
    const request = describeUpdate(event({ kind: "status", fromStatus: "in-progress", toStatus: "need-approval", body: null, reviewerIsMe: true }));
    expect(request).toMatchObject({ verb: "asked you to approve", body: null, href: "/drawings/d1" });

    const approved = describeUpdate(event({ kind: "status", fromStatus: "need-approval", toStatus: "awaiting-approval", body: null }));
    expect(approved.verb).toBe("approved");

    const back = describeUpdate(event({ kind: "status", fromStatus: "need-approval", toStatus: "in-progress", body: "Wrong scale" }));
    expect(back).toMatchObject({ verb: "sent back", body: "“Wrong scale”" });

    const plain = describeUpdate(event({ kind: "status", fromStatus: "in-progress", toStatus: "paused", body: null }));
    expect(plain).toMatchObject({ verb: "changed the status of", body: "In Progress → Paused" });
  });

  test("remarks, receipts and BOM changes", () => {
    const base = { at, actorName: null, projectCode: "BS-001" };
    const remark = describeUpdate({
      ...base, source: "remark", id: "remark:1", resolved: false, drawingId: "d1", code: "CC-001", name: "Cameras",
      revisionNumber: 1, remarkSource: "client", body: "Move camera 3", resolution: null,
    });
    expect(remark).toMatchObject({
      kind: "remark", actorName: "Someone", verb: "raised a client remark on", body: "Move camera 3", href: "/drawings/d1#remarks",
    });

    const resolved = describeUpdate({
      ...base, source: "remark", id: "resolved:1", resolved: true, drawingId: "d1", code: "CC-001", name: "Cameras",
      revisionNumber: 1, remarkSource: "site", body: "Move camera 3", resolution: "Moved in rev2",
    });
    expect(resolved).toMatchObject({ kind: "remark-resolved", verb: "resolved your remark on", body: "Moved in rev2" });

    const issued = describeUpdate({
      ...base, source: "transmittal", id: "issued:1", drawingId: "d1", code: "CC-001", name: "Cameras",
      revisionNumber: 3, purpose: "construction", note: "Site copy",
    });
    expect(issued).toMatchObject({ verb: "issued you", subjectRev: "rev3", body: "For construction · “Site copy”" });

    const approvedBom = describeUpdate({
      ...base, source: "bom-status", id: "bom-status:1", bomId: "b1", projectId: "p1", bomName: "Main BOM",
      revisionLetter: "2", status: "approved", comment: "Client signed",
    });
    expect(approvedBom).toMatchObject({
      kind: "bom-status", verb: "set Approved on", subject: "Main BOM", subjectRev: "Rev2", href: "/builder/p1/b1",
    });

    const handed = describeUpdate({
      ...base, source: "bom-owner", id: "bom-owner:1", bomId: "b1", projectId: "p1", bomName: "Main BOM", revisionLetter: "3",
    });
    expect(handed).toMatchObject({ kind: "bom-owner", verb: "handed you", subjectRev: "Rev3" });
  });
});
