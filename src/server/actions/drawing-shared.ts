"use server";

// Shared remarks and shared time for several drawings ticked on /drawings
// (issue #17). A shared remark is one ordinary remark per drawing, tied by
// `shared_group_id`; shared time is one entry in its own table, so the hours
// never reach a drawing's `Logged` and totals count them once.

import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db/client";
import {
  drawingRemarks,
  drawingRevisions,
  drawingSharedTimeEntries,
  drawingSharedTimeMembers,
  drawings,
  projects,
} from "@/db/schema";
import {
  MAX_BULK_DRAWINGS,
  MIN_SHARED_DRAWINGS,
  SHARED_BLOCK_MESSAGE,
  sharedRemarkBlock,
  sharedTimeBlock,
} from "@/lib/drawing-bulk";
import { MANUAL_REMARK_SOURCES, MAX_ENTRY_HOURS, REMARK_SOURCE_LABEL, formatHours } from "@/lib/drawing-meta";
import { todayIso } from "@/lib/drawing-status";
import { READ_ONLY_ERROR, canEdit, isAdmin } from "@/lib/roles";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import type { DrawingActionResult } from "./drawings";

const fail = (error: string) => ({ ok: false as const, error });

const Ids = z
  .array(z.string().min(1))
  .min(MIN_SHARED_DRAWINGS)
  .max(MAX_BULK_DRAWINGS)
  .transform(ids => [...new Set(ids)]);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** "ELV-101, ELV-102, ELV-103 +2" — how a list of drawings reads in a summary line. */
function listCodes(codes: string[], max = 3) {
  const sorted = [...codes].sort((a, b) => a.localeCompare(b));
  return sorted.length > max ? `${sorted.slice(0, max).join(", ")} +${sorted.length - max}` : sorted.join(", ");
}

/**
 * The selected drawings with their latest revision, locked until the
 * transaction ends so none can be archived halfway. `missing` counts the ones
 * archived or deleted since the list was loaded — then nothing is written.
 */
async function lockSelection(tx: Tx, ids: string[]) {
  const live = await tx
    .select({ id: drawings.id, code: drawings.code, projectId: drawings.projectId })
    .from(drawings)
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .where(and(inArray(drawings.id, ids), isNull(drawings.deletedAt), isNull(projects.deletedAt)))
    .for("update", { of: drawings });
  const latest = await tx
    .selectDistinctOn([drawingRevisions.drawingId], {
      drawingId: drawingRevisions.drawingId,
      revisionId: drawingRevisions.id,
      label: drawingRevisions.label,
    })
    .from(drawingRevisions)
    .where(inArray(drawingRevisions.drawingId, ids))
    .orderBy(drawingRevisions.drawingId, desc(drawingRevisions.number));
  const revOf = new Map(latest.map(r => [r.drawingId, r]));
  const rows = live.flatMap(d => {
    const rev = revOf.get(d.id);
    return rev ? [{ ...d, revisionId: rev.revisionId, label: rev.label }] : [];
  });
  return { rows, missing: ids.length - rows.length };
}

const MISSING_ERROR = (n: number) =>
  `${n === 1 ? "One of the selected drawings was" : `${n} of the selected drawings were`} archived or deleted in the meantime — nothing was saved. Refresh the list and try again.`;

function revalidateShared(rows: { id: string; projectId: string }[]) {
  revalidatePath("/drawings");
  revalidatePath("/dashboard");
  for (const r of rows) revalidatePath(`/drawings/${r.id}`);
  for (const p of new Set(rows.map(r => r.projectId))) revalidatePath(`/projects/${p}`);
}

// ── Shared time ────────────────────────────────────────────────────────────

const LogSharedInput = z.object({
  drawingIds: Ids,
  hours: z.number().positive().max(MAX_ENTRY_HOURS),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional(),
});

/**
 * One time entry for several drawings of one project. The hours aren't split:
 * each drawing shows them apart from its own `Logged`, and the project and
 * overall totals count them once.
 */
export async function logSharedDrawingTime(
  input: z.input<typeof LogSharedInput>,
): Promise<DrawingActionResult<{ id: string }>> {
  const data = LogSharedInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  // Duplicates are dropped first, so the count is checked again; the project rule needs the rows.
  const block = sharedRemarkBlock(data.drawingIds);
  if (block) return fail(SHARED_BLOCK_MESSAGE[block]);
  if (data.workDate > todayIso()) return fail("Time can't be logged for a future date.");
  const hours = Math.round(data.hours * 100) / 100;

  const result = await db.transaction(async tx => {
    const { rows, missing } = await lockSelection(tx, data.drawingIds);
    if (missing > 0) return fail(MISSING_ERROR(missing));
    const projectBlock = sharedTimeBlock(rows);
    if (projectBlock) return fail(SHARED_BLOCK_MESSAGE[projectBlock]);

    const [entry] = await tx
      .insert(drawingSharedTimeEntries)
      .values({
        projectId: rows[0].projectId,
        userId: session.user.id,
        hours,
        workDate: data.workDate,
        note: data.note || null,
      })
      .returning({ id: drawingSharedTimeEntries.id });
    await tx.insert(drawingSharedTimeMembers).values(
      rows.map(r => ({ sharedEntryId: entry.id, drawingId: r.id, revisionId: r.revisionId })),
    );
    return { ok: true as const, id: entry.id, rows };
  });
  if (!result.ok) return result;

  const { id, rows } = result;
  revalidateShared(rows);
  await audit({
    kind: "drawing.time.shared.logged",
    refType: "project",
    refId: rows[0].projectId,
    summary: `${formatHours(hours)} logged on ${rows.length} drawings together — ${listCodes(rows.map(r => r.code))}`,
    payload: {
      projectId: rows[0].projectId,
      entryId: id,
      drawingIds: rows.map(r => r.id),
      revisionIds: rows.map(r => r.revisionId),
      hours,
      workDate: data.workDate,
    },
  });
  return { ok: true, id };
}

/** Removes the whole shared entry from every drawing it covers. Your own, or anyone's if you are an admin. */
export async function deleteSharedDrawingTime(input: { id: string }): Promise<DrawingActionResult> {
  const id = z.string().min(1).parse(input.id);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const [entry] = await db
    .select({
      userId: drawingSharedTimeEntries.userId,
      hours: drawingSharedTimeEntries.hours,
      projectId: drawingSharedTimeEntries.projectId,
      workDate: drawingSharedTimeEntries.workDate,
    })
    .from(drawingSharedTimeEntries)
    .where(eq(drawingSharedTimeEntries.id, id))
    .limit(1);
  if (!entry) return fail("Time entry not found.");
  if (entry.userId !== session.user.id && !isAdmin(session.user)) {
    return fail("You can only remove your own time entries.");
  }

  const members = await db
    .select({ id: drawings.id, code: drawings.code, projectId: drawings.projectId })
    .from(drawingSharedTimeMembers)
    .innerJoin(drawings, eq(drawings.id, drawingSharedTimeMembers.drawingId))
    .where(eq(drawingSharedTimeMembers.sharedEntryId, id));
  // The members go with it (on delete cascade).
  await db.delete(drawingSharedTimeEntries).where(eq(drawingSharedTimeEntries.id, id));

  revalidateShared(members);
  await audit({
    kind: "drawing.time.shared.deleted",
    refType: "project",
    refId: entry.projectId,
    summary: `${formatHours(entry.hours)} shared by ${members.length} drawings removed — ${listCodes(members.map(m => m.code))}`,
    payload: {
      projectId: entry.projectId,
      entryId: id,
      drawingIds: members.map(m => m.id),
      hours: entry.hours,
      workDate: entry.workDate,
    },
  });
  return { ok: true };
}

// ── Shared remark ──────────────────────────────────────────────────────────

const SharedRemarkInput = z.object({
  drawingIds: Ids,
  source: z.enum(MANUAL_REMARK_SOURCES),
  body: z.string().trim().min(1).max(4000),
});

/**
 * The same remark on each selected drawing's latest revision — any projects.
 * Each drawing gets its own ordinary remark (counted, listed and closed on its
 * own); they share `shared_group_id` so every drawing shows the others.
 */
export async function addSharedDrawingRemark(
  input: z.input<typeof SharedRemarkInput>,
): Promise<DrawingActionResult<{ groupId: string }>> {
  const data = SharedRemarkInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  // Duplicates are dropped first, so the count is checked again.
  const block = sharedRemarkBlock(data.drawingIds);
  if (block) return fail(SHARED_BLOCK_MESSAGE[block]);
  const groupId = createId();

  const result = await db.transaction(async tx => {
    const { rows, missing } = await lockSelection(tx, data.drawingIds);
    if (missing > 0) return fail(MISSING_ERROR(missing));
    await tx.insert(drawingRemarks).values(
      rows.map(r => ({
        drawingId: r.id,
        revisionId: r.revisionId,
        source: data.source,
        body: data.body,
        raisedById: session.user.id,
        sharedGroupId: groupId,
      })),
    );
    return { ok: true as const, rows };
  });
  if (!result.ok) return result;

  const { rows } = result;
  revalidateShared(rows);
  for (const r of rows) {
    await audit({
      kind: "drawing.remark.added",
      refType: "drawing",
      refId: r.id,
      summary: `${REMARK_SOURCE_LABEL[data.source]} remark on ${r.code} ${r.label} — shared by ${rows.length} drawings`,
      payload: {
        projectId: r.projectId,
        revisionId: r.revisionId,
        source: data.source,
        shared: true,
        sharedGroupId: groupId,
        drawingCount: rows.length,
      },
    });
  }
  return { ok: true, groupId };
}
