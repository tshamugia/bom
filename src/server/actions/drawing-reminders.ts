"use server";

import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { drawingReminderRecipients, projects, systemSettings, SYSTEM_SETTINGS_ID, user } from "@/db/schema";
import { ReminderConfigSchema, type ReminderConfig } from "@/lib/drawing-reminders";
import { requireRole } from "../auth-context";
import { audit } from "../audit";
import { runDrawingReminders } from "../lib/drawing-reminder-run";
import type { DrawingActionResult } from "./drawings";

const fail = (error: string) => ({ ok: false as const, error });

/** Reminders mail the whole team, so only owners and admins change them. */
export async function saveReminderConfig(input: ReminderConfig): Promise<DrawingActionResult> {
  const config = ReminderConfigSchema.parse(input);
  const session = await requireRole("admin");

  await db
    .insert(systemSettings)
    .values({ id: SYSTEM_SETTINGS_ID, drawingReminders: config, updatedById: session.user.id, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.id,
      set: { drawingReminders: config, updatedById: session.user.id, updatedAt: new Date() },
    });

  revalidatePath("/settings/drawings");
  await audit({
    kind: "drawing.settings.updated",
    summary: `Drawing reminders ${config.enabled ? `on, daily at ${String(config.hour).padStart(2, "0")}:00` : "off"}`,
    payload: { reminders: config },
  });
  return { ok: true };
}

const RecipientsInput = z.object({
  /** `null` edits the managers who hear about every project. */
  projectId: z.string().min(1).nullable(),
  userIds: z.array(z.string().min(1)).max(200),
});

export async function setReminderRecipients(input: z.infer<typeof RecipientsInput>): Promise<DrawingActionResult> {
  const { projectId, userIds } = RecipientsInput.parse(input);
  await requireRole("admin");

  let projectCode: string | null = null;
  if (projectId) {
    const [p] = await db
      .select({ code: projects.code })
      .from(projects)
      .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
      .limit(1);
    if (!p) return fail("Project not found.");
    projectCode = p.code;
  }

  const unique = [...new Set(userIds)];
  const active = unique.length
    ? await db.select({ id: user.id }).from(user).where(and(inArray(user.id, unique), eq(user.disabled, false)))
    : [];
  if (active.length !== unique.length) return fail("Only active users can receive reminders.");

  const scope = projectId
    ? eq(drawingReminderRecipients.projectId, projectId)
    : isNull(drawingReminderRecipients.projectId);
  await db.transaction(async tx => {
    await tx.delete(drawingReminderRecipients).where(scope);
    if (unique.length) {
      await tx.insert(drawingReminderRecipients).values(unique.map(userId => ({ projectId, userId })));
    }
  });

  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/settings/drawings");
  const who = `${unique.length} manager${unique.length === 1 ? "" : "s"}`;
  await audit({
    kind: "drawing.settings.updated",
    refType: projectId ? "project" : undefined,
    refId: projectId ?? undefined,
    summary: projectCode ? `Drawing reminders for ${projectCode}: ${who}` : `Drawing reminders for all projects: ${who}`,
    payload: { projectId, reminderUserIds: unique },
  });
  return { ok: true };
}

/** Sends today's digests right away — ignores the on/off switch and the hour, not the rules. */
export async function sendRemindersNow(): Promise<DrawingActionResult<{ recipients: number; items: number; failed: number }>> {
  await requireRole("admin");
  const result = await runDrawingReminders({ trigger: "manual" });
  if (result.status !== "done") return fail("Nothing was sent.");
  revalidatePath("/settings/drawings");
  return { ok: true, recipients: result.recipients, items: result.items, failed: result.failed };
}
