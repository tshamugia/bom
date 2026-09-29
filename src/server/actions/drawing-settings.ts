"use server";

import { z } from "zod";
import { and, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { drawingDisciplines, drawingNotifyRecipients, projects, user } from "@/db/schema";
import { ADMIN_ONLY_ERROR, isAdmin } from "@/lib/roles";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import type { DrawingActionResult } from "./drawings";

const fail = (error: string) => ({ ok: false as const, error });

const RecipientsInput = z.object({
  /** `null` edits the list notified about every project. */
  projectId: z.string().min(1).nullable(),
  userIds: z.array(z.string().min(1)).max(200),
});

export async function setDrawingRecipients(input: z.infer<typeof RecipientsInput>): Promise<DrawingActionResult> {
  const { projectId, userIds } = RecipientsInput.parse(input);
  if (!isAdmin((await requireSession()).user)) return fail(ADMIN_ONLY_ERROR);

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
    ? await db
        .select({ id: user.id })
        .from(user)
        .where(and(inArray(user.id, unique), eq(user.disabled, false)))
    : [];
  if (active.length !== unique.length) return fail("Only active users can receive drawing notifications.");

  const scope = projectId ? eq(drawingNotifyRecipients.projectId, projectId) : isNull(drawingNotifyRecipients.projectId);
  await db.transaction(async tx => {
    await tx.delete(drawingNotifyRecipients).where(scope);
    if (unique.length) {
      await tx.insert(drawingNotifyRecipients).values(unique.map(userId => ({ projectId, userId })));
    }
  });

  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/settings/drawings");
  await audit({
    kind: "drawing.settings.updated",
    refType: projectId ? "project" : undefined,
    refId: projectId ?? undefined,
    summary: projectCode
      ? `Drawing notifications for ${projectCode}: ${unique.length} recipient${unique.length === 1 ? "" : "s"}`
      : `Drawing notifications for all projects: ${unique.length} recipient${unique.length === 1 ? "" : "s"}`,
    payload: { projectId, userIds: unique },
  });
  return { ok: true };
}

const DisciplineName = z.string().trim().min(1).max(60);

async function isDisciplineNameTaken(name: string, exceptId?: string) {
  const [hit] = await db
    .select({ id: drawingDisciplines.id })
    .from(drawingDisciplines)
    .where(and(
      sql`lower(${drawingDisciplines.name}) = lower(${name})`,
      exceptId ? ne(drawingDisciplines.id, exceptId) : undefined,
    ))
    .limit(1);
  return !!hit;
}

function revalidateDisciplines() {
  revalidatePath("/settings/drawings");
  revalidatePath("/drawings");
}

export async function createDiscipline(input: { name: string }): Promise<DrawingActionResult> {
  const name = DisciplineName.parse(input.name);
  if (!isAdmin((await requireSession()).user)) return fail(ADMIN_ONLY_ERROR);
  if (await isDisciplineNameTaken(name)) return fail(`${name} already exists.`);

  const [{ last }] = await db.select({ last: max(drawingDisciplines.position) }).from(drawingDisciplines);
  await db.insert(drawingDisciplines).values({ name, position: (last ?? -1) + 1 });

  revalidateDisciplines();
  await audit({ kind: "drawing.settings.updated", summary: `Discipline ${name} added`, payload: { name } });
  return { ok: true };
}

export async function renameDiscipline(input: { id: string; name: string }): Promise<DrawingActionResult> {
  const id = z.string().min(1).parse(input.id);
  const name = DisciplineName.parse(input.name);
  if (!isAdmin((await requireSession()).user)) return fail(ADMIN_ONLY_ERROR);
  if (await isDisciplineNameTaken(name, id)) return fail(`${name} already exists.`);

  const [before] = await db
    .select({ name: drawingDisciplines.name })
    .from(drawingDisciplines)
    .where(eq(drawingDisciplines.id, id))
    .limit(1);
  if (!before) return fail("Discipline not found.");
  if (before.name === name) return { ok: true };
  await db.update(drawingDisciplines).set({ name }).where(eq(drawingDisciplines.id, id));

  revalidateDisciplines();
  await audit({
    kind: "drawing.settings.updated",
    summary: `Discipline ${before.name} renamed to ${name}`,
    payload: { id, from: before.name, to: name },
  });
  return { ok: true };
}

/** Drawings that used the discipline keep working with an empty discipline. */
export async function deleteDiscipline(input: { id: string }): Promise<DrawingActionResult> {
  const id = z.string().min(1).parse(input.id);
  if (!isAdmin((await requireSession()).user)) return fail(ADMIN_ONLY_ERROR);
  const [gone] = await db
    .delete(drawingDisciplines)
    .where(eq(drawingDisciplines.id, id))
    .returning({ name: drawingDisciplines.name });
  if (!gone) return fail("Discipline not found.");

  revalidateDisciplines();
  await audit({ kind: "drawing.settings.updated", summary: `Discipline ${gone.name} removed`, payload: { id } });
  return { ok: true };
}
