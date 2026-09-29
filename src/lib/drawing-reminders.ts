// Pure reminder rules — shared by the settings form (client) and the daily
// digest job (server), so this module must stay free of server-only and DB imports.

import { z } from "zod";
import {
  DRAWING_STATUS_LABEL,
  formatDrawingRevision,
  isClosedStatus,
  todayIso,
  type DrawingStatus,
} from "./drawing-status";
import { TRANSMITTAL_PURPOSE_LABEL, type TransmittalPurpose } from "./drawing-meta";

const Flag = (d: boolean) => z.boolean().default(d);
const Days = (d: number) => z.number().int().min(0).max(90).default(d);

// `prefault` (not `default`) so a missing rule still gets its inner defaults.
export const ReminderConfigSchema = z.object({
  /** Off until an admin switches it on, so a fresh or local database never mails anyone. */
  enabled: Flag(false),
  /** Tbilisi hour the digest goes out at (or right after). */
  hour: z.number().int().min(0).max(23).default(9),
  weekdaysOnly: Flag(true),
  overdue: z.object({ enabled: Flag(true), owner: Flag(true), managers: Flag(true) }).prefault({}),
  dueSoon: z.object({ enabled: Flag(true), days: Days(3), owner: Flag(true), managers: Flag(false) }).prefault({}),
  review: z
    .object({ enabled: Flag(true), days: Days(2), reviewer: Flag(true), owner: Flag(false), managers: Flag(true) })
    .prefault({}),
  remarks: z.object({ enabled: Flag(true), days: Days(7), owner: Flag(true), managers: Flag(false) }).prefault({}),
  transmittals: z
    .object({ enabled: Flag(true), days: Days(2), recipient: Flag(true), sender: Flag(false) })
    .prefault({}),
});

export type ReminderConfig = z.infer<typeof ReminderConfigSchema>;

/** Stored JSON may be empty, partial or from an older version — never throws. */
export function parseReminderConfig(raw: unknown): ReminderConfig {
  const parsed = ReminderConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : ReminderConfigSchema.parse({});
}

export const REMINDER_KINDS = ["overdue", "due-soon", "review", "remarks", "transmittal"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_KIND_LABEL: Record<ReminderKind, string> = {
  "overdue": "Overdue drawings",
  "due-soon": "Due soon",
  "review": "Waiting for internal approval",
  "remarks": "Open remarks",
  "transmittal": "Transmittals not acknowledged",
};

export type ReminderDrawing = {
  id: string;
  code: string;
  name: string;
  projectId: string;
  projectCode: string;
  revisionNumber: number;
  status: DrawingStatus;
  dueDate: string | null;
  ownerId: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  /** When the latest revision last moved to Need to be approved. */
  needApprovalSince: Date | null;
  openRemarks: number;
  oldestOpenRemarkAt: Date | null;
};

export type ReminderTransmittal = {
  id: string;
  drawingId: string;
  code: string;
  name: string;
  projectId: string;
  projectCode: string;
  revisionNumber: number;
  purpose: TransmittalPurpose;
  recipientUserId: string;
  recipientName: string;
  sentById: string | null;
  createdAt: Date;
};

export type ReminderItem = {
  kind: ReminderKind;
  drawingId: string;
  projectCode: string;
  code: string;
  name: string;
  revisionNumber: number;
  detail: string;
};

export type ManagerRow = { projectId: string | null; userId: string };

const MS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isWeekend(day: string): boolean {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

const tbilisiHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tbilisi", hour: "2-digit", hourCycle: "h23" });

/** Whether the scheduled digest is due at `now` (the once-a-day guard lives in the database). */
export function isReminderTime(config: ReminderConfig, now: Date): boolean {
  if (!config.enabled) return false;
  if (config.weekdaysOnly && isWeekend(todayIso(now))) return false;
  return Number(tbilisiHour.format(now)) >= config.hour;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Works out who hears about what today. Each user gets one digest; an item
 * that reaches someone twice (e.g. as owner and as manager) is listed once.
 */
export function collectReminders(input: {
  config: ReminderConfig;
  today: string;
  drawings: ReminderDrawing[];
  transmittals: ReminderTransmittal[];
  managers: ManagerRow[];
}): Map<string, ReminderItem[]> {
  const { config, today } = input;
  const out = new Map<string, Map<string, ReminderItem>>();

  const managersOf = (projectId: string) =>
    input.managers.filter(m => m.projectId === null || m.projectId === projectId).map(m => m.userId);

  const add = (userIds: Array<string | null | undefined>, key: string, item: ReminderItem) => {
    for (const id of userIds) {
      if (!id) continue;
      const list = out.get(id) ?? new Map<string, ReminderItem>();
      list.set(key, item);
      out.set(id, list);
    }
  };

  for (const d of input.drawings) {
    const base = {
      drawingId: d.id,
      projectCode: d.projectCode,
      code: d.code,
      name: d.name,
      revisionNumber: d.revisionNumber,
    };
    const closed = isClosedStatus(d.status);
    const managers = managersOf(d.projectId);

    if (d.dueDate && !closed) {
      const left = daysBetween(today, d.dueDate);
      if (left < 0 && config.overdue.enabled) {
        add(
          [config.overdue.owner ? d.ownerId : null, ...(config.overdue.managers ? managers : [])],
          `overdue:${d.id}`,
          { ...base, kind: "overdue", detail: `due ${d.dueDate}, ${plural(-left, "day")} late · ${DRAWING_STATUS_LABEL[d.status]}` },
        );
      } else if (left >= 0 && config.dueSoon.enabled && left <= config.dueSoon.days) {
        add(
          [config.dueSoon.owner ? d.ownerId : null, ...(config.dueSoon.managers ? managers : [])],
          `due-soon:${d.id}`,
          { ...base, kind: "due-soon", detail: `due ${d.dueDate} (${left === 0 ? "today" : `in ${plural(left, "day")}`}) · ${DRAWING_STATUS_LABEL[d.status]}` },
        );
      }
    }

    if (config.review.enabled && d.status === "need-approval" && d.needApprovalSince) {
      const waiting = daysBetween(todayIso(d.needApprovalSince), today);
      if (waiting >= config.review.days) {
        add(
          [
            config.review.reviewer ? d.reviewerId : null,
            config.review.owner ? d.ownerId : null,
            ...(config.review.managers ? managers : []),
          ],
          `review:${d.id}`,
          { ...base, kind: "review", detail: `waiting ${plural(waiting, "day")} for ${d.reviewerName ?? "the approving engineer"}` },
        );
      }
    }

    if (config.remarks.enabled && d.openRemarks > 0 && d.oldestOpenRemarkAt) {
      const age = daysBetween(todayIso(d.oldestOpenRemarkAt), today);
      if (age >= config.remarks.days) {
        add(
          [config.remarks.owner ? d.ownerId : null, ...(config.remarks.managers ? managers : [])],
          `remarks:${d.id}`,
          { ...base, kind: "remarks", detail: `${plural(d.openRemarks, "open remark")}, oldest ${plural(age, "day")} old` },
        );
      }
    }
  }

  if (config.transmittals.enabled) {
    for (const t of input.transmittals) {
      const age = daysBetween(todayIso(t.createdAt), today);
      if (age < config.transmittals.days) continue;
      const base = {
        kind: "transmittal" as const,
        drawingId: t.drawingId,
        projectCode: t.projectCode,
        code: t.code,
        name: t.name,
        revisionNumber: t.revisionNumber,
      };
      const purpose = TRANSMITTAL_PURPOSE_LABEL[t.purpose].toLowerCase();
      if (config.transmittals.recipient) {
        add([t.recipientUserId], `transmittal:${t.id}`, {
          ...base,
          detail: `${formatDrawingRevision(t.revisionNumber)} issued to you ${purpose} ${plural(age, "day")} ago — please acknowledge`,
        });
      }
      if (config.transmittals.sender && t.sentById !== t.recipientUserId) {
        add([t.sentById], `transmittal:${t.id}`, {
          ...base,
          detail: `${formatDrawingRevision(t.revisionNumber)} issued to ${t.recipientName} ${plural(age, "day")} ago — not acknowledged`,
        });
      }
    }
  }

  const result = new Map<string, ReminderItem[]>();
  for (const [userId, items] of out) {
    result.set(
      userId,
      [...items.values()].sort(
        (a, b) =>
          REMINDER_KINDS.indexOf(a.kind) - REMINDER_KINDS.indexOf(b.kind) ||
          a.projectCode.localeCompare(b.projectCode) ||
          a.code.localeCompare(b.code),
      ),
    );
  }
  return result;
}

export function buildReminderDigestEmail(input: {
  appUrl: string;
  userName: string;
  today: string;
  items: ReminderItem[];
}): { subject: string; text: string } {
  const base = input.appUrl.replace(/\/$/, "");
  const lines = [`Hi ${input.userName},`, "", `Your drawing reminders for ${input.today}:`];

  for (const kind of REMINDER_KINDS) {
    const items = input.items.filter(i => i.kind === kind);
    if (items.length === 0) continue;
    lines.push("", `${REMINDER_KIND_LABEL[kind]} (${items.length})`);
    for (const i of items) {
      lines.push(`- [${i.projectCode}] ${i.code} ${formatDrawingRevision(i.revisionNumber)} — ${i.name}: ${i.detail}`);
      lines.push(`  ${base}/drawings/${i.drawingId}`);
    }
  }
  lines.push("", `Dashboard: ${base}/dashboard`);
  lines.push("", "You get this email because of the reminder settings in Settings → Drawings.");

  return {
    subject: `Drawing reminders — ${plural(input.items.length, "item")} (${input.today})`,
    text: lines.join("\n"),
  };
}
