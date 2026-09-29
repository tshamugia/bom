import { describe, expect, test } from "vitest";
import {
  addDays,
  buildReminderDigestEmail,
  collectReminders,
  daysBetween,
  isReminderTime,
  parseReminderConfig,
  type ReminderDrawing,
  type ReminderTransmittal,
} from "@/lib/drawing-reminders";

const TODAY = "2026-09-29"; // a Tuesday

function drawing(overrides: Partial<ReminderDrawing> = {}): ReminderDrawing {
  return {
    id: "d1",
    code: "ELV-101",
    name: "CCTV layout",
    projectId: "p1",
    projectCode: "HLT",
    revisionNumber: 2,
    status: "in-progress",
    dueDate: null,
    ownerId: "owner",
    reviewerId: null,
    reviewerName: null,
    needApprovalSince: null,
    openRemarks: 0,
    oldestOpenRemarkAt: null,
    ...overrides,
  };
}

function transmittal(overrides: Partial<ReminderTransmittal> = {}): ReminderTransmittal {
  return {
    id: "t1",
    drawingId: "d1",
    code: "ELV-101",
    name: "CCTV layout",
    projectId: "p1",
    projectCode: "HLT",
    revisionNumber: 2,
    purpose: "construction",
    recipientUserId: "foreman",
    recipientName: "Site Foreman",
    sentById: "owner",
    createdAt: new Date("2026-09-25T08:00:00Z"),
    ...overrides,
  };
}

const run = (input: { drawings?: ReminderDrawing[]; transmittals?: ReminderTransmittal[]; managers?: { projectId: string | null; userId: string }[]; config?: unknown }) =>
  collectReminders({
    config: parseReminderConfig(input.config ?? {}),
    today: TODAY,
    drawings: input.drawings ?? [],
    transmittals: input.transmittals ?? [],
    managers: input.managers ?? [],
  });

describe("parseReminderConfig", () => {
  test("empty or broken JSON falls back to defaults, switched off", () => {
    const c = parseReminderConfig({});
    expect(c.enabled).toBe(false);
    expect(c.hour).toBe(9);
    expect(c.dueSoon).toMatchObject({ enabled: true, days: 3, owner: true, managers: false });
    expect(parseReminderConfig({ hour: "nope" })).toEqual(c);
    expect(parseReminderConfig(null)).toEqual(c);
  });

  test("a partial rule keeps the defaults for its other fields", () => {
    expect(parseReminderConfig({ review: { days: 5 } }).review).toEqual({
      enabled: true, days: 5, reviewer: true, owner: false, managers: true,
    });
  });
});

describe("date helpers", () => {
  test("daysBetween and addDays", () => {
    expect(daysBetween("2026-09-25", TODAY)).toBe(4);
    expect(daysBetween(TODAY, "2026-09-25")).toBe(-4);
    expect(addDays(TODAY, 3)).toBe("2026-10-02");
  });
});

describe("isReminderTime", () => {
  const on = parseReminderConfig({ enabled: true, hour: 9 });
  test("waits for the configured Tbilisi hour (UTC+4)", () => {
    expect(isReminderTime(on, new Date("2026-09-29T04:59:00Z"))).toBe(false); // 08:59 Tbilisi
    expect(isReminderTime(on, new Date("2026-09-29T05:00:00Z"))).toBe(true); // 09:00 Tbilisi
  });
  test("skips weekends unless told otherwise, and never runs when off", () => {
    const saturday = new Date("2026-10-03T08:00:00Z");
    expect(isReminderTime(on, saturday)).toBe(false);
    expect(isReminderTime({ ...on, weekdaysOnly: false }, saturday)).toBe(true);
    expect(isReminderTime({ ...on, enabled: false }, new Date("2026-09-29T08:00:00Z"))).toBe(false);
  });
});

describe("collectReminders", () => {
  test("overdue drawings go to the owner and the managers of that project", () => {
    const out = run({
      drawings: [drawing({ dueDate: "2026-09-27" })],
      managers: [{ projectId: null, userId: "boss" }, { projectId: "p1", userId: "pm" }, { projectId: "p2", userId: "other-pm" }],
    });
    expect([...out.keys()].sort()).toEqual(["boss", "owner", "pm"]);
    expect(out.get("owner")![0]).toMatchObject({ kind: "overdue", detail: expect.stringContaining("2 days late") });
  });

  test("closed drawings are never overdue or due soon", () => {
    const out = run({ drawings: [drawing({ dueDate: "2026-09-01", status: "approved-a" })] });
    expect(out.size).toBe(0);
  });

  test("due soon respects the window and the rule's recipients", () => {
    const inWindow = drawing({ id: "a", dueDate: "2026-10-02" });
    const tooFar = drawing({ id: "b", dueDate: "2026-10-03" });
    const out = run({ drawings: [inWindow, tooFar], managers: [{ projectId: null, userId: "boss" }] });
    expect(out.get("owner")!.map(i => i.drawingId)).toEqual(["a"]);
    expect(out.has("boss")).toBe(false); // dueSoon.managers defaults to off
  });

  test("pending review reminds the approving engineer after the threshold", () => {
    const d = drawing({
      status: "need-approval",
      reviewerId: "rev",
      reviewerName: "Nino",
      needApprovalSince: new Date("2026-09-28T10:00:00Z"),
    });
    expect(run({ drawings: [d] }).has("rev")).toBe(false); // 1 day < 2
    const older = { ...d, needApprovalSince: new Date("2026-09-26T10:00:00Z") };
    const out = run({ drawings: [older] });
    expect(out.get("rev")![0]).toMatchObject({ kind: "review", detail: "waiting 3 days for Nino" });
    expect(out.has("owner")).toBe(false);
  });

  test("open remarks are reported once they are old enough", () => {
    const d = drawing({ openRemarks: 2, oldestOpenRemarkAt: new Date("2026-09-20T10:00:00Z") });
    expect(run({ drawings: [d] }).get("owner")![0]).toMatchObject({ kind: "remarks", detail: "2 open remarks, oldest 9 days old" });
    expect(run({ drawings: [d], config: { remarks: { days: 10 } } }).size).toBe(0);
  });

  test("unacknowledged transmittals remind the recipient, and the sender only if asked", () => {
    expect([...run({ transmittals: [transmittal()] }).keys()]).toEqual(["foreman"]);
    const both = run({ transmittals: [transmittal()], config: { transmittals: { sender: true } } });
    expect([...both.keys()].sort()).toEqual(["foreman", "owner"]);
    expect(run({ transmittals: [transmittal({ createdAt: new Date("2026-09-29T06:00:00Z") })] }).size).toBe(0);
  });

  test("one item per drawing and kind, even when a user matches twice", () => {
    const out = run({
      drawings: [drawing({ dueDate: "2026-09-27" })],
      managers: [{ projectId: null, userId: "owner" }, { projectId: "p1", userId: "owner" }],
    });
    expect(out.get("owner")).toHaveLength(1);
  });

  test("items are ordered by kind", () => {
    const out = run({
      drawings: [
        drawing({ id: "r", openRemarks: 1, oldestOpenRemarkAt: new Date("2026-09-01T00:00:00Z") }),
        drawing({ id: "o", dueDate: "2026-09-28" }),
      ],
    });
    expect(out.get("owner")!.map(i => i.kind)).toEqual(["overdue", "remarks"]);
  });
});

describe("buildReminderDigestEmail", () => {
  test("groups items under headings with links", () => {
    const items = run({ drawings: [drawing({ dueDate: "2026-09-27" })] }).get("owner")!;
    const { subject, text } = buildReminderDigestEmail({ appUrl: "https://bom.example/", userName: "Tengo", today: TODAY, items });
    expect(subject).toBe("Drawing reminders — 1 item (2026-09-29)");
    expect(text).toContain("Overdue drawings (1)");
    expect(text).toContain("- [HLT] ELV-101 rev2 — CCTV layout: due 2026-09-27, 2 days late · In Progress");
    expect(text).toContain("https://bom.example/drawings/d1");
    expect(text).not.toContain("Due soon");
  });
});
