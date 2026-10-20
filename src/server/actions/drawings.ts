"use server";

import { z } from "zod";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db/client";
import { drawings, drawingDisciplines, drawingEvents, drawingRevisions, projects, user } from "@/db/schema";
import {
  DRAWING_STATUSES,
  DRAWING_STATUS_LABEL,
  OWNER_IS_REVIEWER_MESSAGE,
  TRANSITION_ERROR_MESSAGE,
  checkDrawingTransition,
  formatDrawingRevision,
  isOwnerChangeBlocked,
  type DrawingStatus,
  type TransitionKind,
} from "@/lib/drawing-status";
import { MAX_BULK_DRAWINGS, planBulkDueDate, planBulkOwner, planBulkStatus, type BulkSkip } from "@/lib/drawing-bulk";
import { MAX_ESTIMATE_HOURS, formatHours } from "@/lib/drawing-meta";
import { ADMIN_ONLY_ERROR, READ_ONLY_ERROR, canEdit, isAdmin } from "@/lib/roles";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { isUniqueViolation } from "../lib/db-errors";
import { drawingCodeInProject, lockDrawingCodes, nextDrawingCode } from "../lib/codes";
import { notifyDrawingStatusChange, notifyDrawingStatusChanges, type DrawingStatusNotice } from "../lib/drawing-notify";

// Expected failures are returned, not thrown: Next.js hides thrown messages
// from the client in production, and these are meant to be read by the user.
export type DrawingActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

const Id = z.string().min(1);

// No `code`: it is generated from the name on create (`src/lib/codes.ts`) and
// only changes when the drawing moves to a project that already uses it.
const DrawingFields = z.object({
  projectId: Id,
  name: z.string().trim().min(1).max(200),
  disciplineId: Id,
  ownerId: Id,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  estimatedHours: z.number().positive().max(MAX_ESTIMATE_HOURS).nullable(),
  /** Path on the company file server, e.g. `2026/BMW/CCTV`; blank clears it. */
  fileLocation: z.string().trim().max(500).nullish().transform(v => v || null),
});

async function findProject(id: string) {
  const [p] = await db
    .select({ id: projects.id, code: projects.code })
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1);
  return p ?? null;
}

async function findDiscipline(id: string) {
  const [d] = await db
    .select({ id: drawingDisciplines.id, name: drawingDisciplines.name })
    .from(drawingDisciplines)
    .where(eq(drawingDisciplines.id, id))
    .limit(1);
  return d ?? null;
}

/** Owners and approving engineers must be active editors — viewers can't act on drawings. */
async function findActiveEngineer(id: string) {
  const [u] = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.id, id), eq(user.disabled, false), ne(user.role, "viewer")))
    .limit(1);
  return u ?? null;
}

async function latestRevision(drawingId: string) {
  const [rev] = await db
    .select({
      id: drawingRevisions.id,
      number: drawingRevisions.number,
      status: drawingRevisions.status,
      reviewerId: drawingRevisions.reviewerId,
      reviewedById: drawingRevisions.reviewedById,
    })
    .from(drawingRevisions)
    .where(eq(drawingRevisions.drawingId, drawingId))
    .orderBy(desc(drawingRevisions.number))
    .limit(1);
  return rev ?? null;
}

function revalidateDrawing(id: string, ...projectIds: string[]) {
  revalidatePath("/drawings");
  revalidatePath(`/drawings/${id}`);
  for (const p of new Set(projectIds)) revalidatePath(`/projects/${p}`);
}

const CreateInput = DrawingFields.extend({
  commitMessage: z.string().trim().max(2000).optional(),
});

const CODE_RACE_ERROR = "Someone just took that code — try again.";

const SuggestCodeInput = z.object({
  projectId: z.string(),
  name: z.string().trim().max(200),
  /** Editing: keep this drawing's own code when it is free in `projectId`. */
  drawingId: z.string().optional(),
});

/** The code the drawing dialogs show before saving; the server assigns the real one. */
export async function suggestDrawingCode(input: z.input<typeof SuggestCodeInput>): Promise<string> {
  const { projectId, name, drawingId } = SuggestCodeInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user) || !projectId || !name) return "";
  if (drawingId) {
    const [d] = await db
      .select({ id: drawings.id, code: drawings.code })
      .from(drawings)
      .where(and(eq(drawings.id, drawingId), isNull(drawings.deletedAt)))
      .limit(1);
    if (d) return drawingCodeInProject(db, { ...d, name }, projectId);
  }
  return nextDrawingCode(db, projectId, name);
}

export async function createDrawing(
  input: z.input<typeof CreateInput>,
): Promise<DrawingActionResult<{ id: string; code: string }>> {
  const data = CreateInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const project = await findProject(data.projectId);
  if (!project) return fail("Project not found.");
  if (!(await findDiscipline(data.disciplineId))) return fail("Discipline not found.");
  if (!(await findActiveEngineer(data.ownerId))) return fail("The owner must be an active user who isn't a viewer.");

  let created: { id: string; code: string };
  try {
    created = await db.transaction(async tx => {
      await lockDrawingCodes(tx, data.projectId);
      const [d] = await tx.insert(drawings).values({
        projectId: data.projectId,
        code: await nextDrawingCode(tx, data.projectId, data.name),
        name: data.name,
        disciplineId: data.disciplineId,
        ownerId: data.ownerId,
        dueDate: data.dueDate,
        estimatedHours: data.estimatedHours,
        fileLocation: data.fileLocation,
        createdById: session.user.id,
        lastModifiedById: session.user.id,
      }).returning({ id: drawings.id, code: drawings.code });
      const [rev] = await tx.insert(drawingRevisions).values({
        drawingId: d.id,
        number: 1,
        commitMessage: data.commitMessage || "Initial revision",
        createdById: session.user.id,
      }).returning({ id: drawingRevisions.id });
      await tx.insert(drawingEvents).values({
        drawingId: d.id,
        revisionId: rev.id,
        kind: "created",
        toStatus: "in-progress",
        actorId: session.user.id,
      });
      return d;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(CODE_RACE_ERROR);
    throw e;
  }

  const { id, code } = created;
  revalidateDrawing(id, data.projectId);
  await audit({
    kind: "drawing.created",
    refType: "drawing",
    refId: id,
    summary: `${project.code} · ${code} — ${data.name} created`,
    payload: { projectId: data.projectId, code },
  });
  return { ok: true, id, code };
}

const UpdateInput = DrawingFields.extend({ id: Id });

export async function updateDrawing(input: z.input<typeof UpdateInput>): Promise<DrawingActionResult> {
  const { id, ...data } = UpdateInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const [current] = await db
    .select({
      code: drawings.code,
      name: drawings.name,
      projectId: drawings.projectId,
      disciplineId: drawings.disciplineId,
      ownerId: drawings.ownerId,
      dueDate: drawings.dueDate,
      estimatedHours: drawings.estimatedHours,
      fileLocation: drawings.fileLocation,
    })
    .from(drawings)
    .where(and(eq(drawings.id, id), isNull(drawings.deletedAt)))
    .limit(1);
  if (!current) return fail("Drawing not found.");

  const project = await findProject(data.projectId);
  if (!project) return fail("Project not found.");
  const discipline = await findDiscipline(data.disciplineId);
  if (!discipline) return fail("Discipline not found.");
  const owner = await findActiveEngineer(data.ownerId);
  if (!owner) return fail("The owner must be an active user who isn't a viewer.");

  const changes: string[] = [];
  if (current.name !== data.name) changes.push(`Name: ${current.name} → ${data.name}`);
  if (current.projectId !== data.projectId) {
    const before = await findProject(current.projectId);
    changes.push(`Project: ${before?.code ?? "—"} → ${project.code}`);
  }
  if (current.disciplineId !== data.disciplineId) {
    const before = current.disciplineId ? await findDiscipline(current.disciplineId) : null;
    changes.push(`Discipline: ${before?.name ?? "—"} → ${discipline.name}`);
  }
  if (current.ownerId !== data.ownerId) {
    const [before] = current.ownerId
      ? await db.select({ name: user.name }).from(user).where(eq(user.id, current.ownerId)).limit(1)
      : [];
    changes.push(`Owner: ${before?.name ?? "—"} → ${owner.name}`);
  }
  if (current.dueDate !== data.dueDate) changes.push(`Due date: ${current.dueDate ?? "—"} → ${data.dueDate ?? "—"}`);
  if (current.estimatedHours !== data.estimatedHours) {
    changes.push(`Estimate: ${formatHours(current.estimatedHours)} → ${formatHours(data.estimatedHours)}`);
  }
  if (current.fileLocation !== data.fileLocation) {
    changes.push(`File location: ${current.fileLocation ?? "—"} → ${data.fileLocation ?? "—"}`);
  }
  if (changes.length === 0) return { ok: true };

  const rev = await latestRevision(id);
  if (!rev) return fail("Drawing has no revisions.");
  if (current.ownerId !== data.ownerId && isOwnerChangeBlocked({ newOwnerId: data.ownerId, ...rev })) {
    return fail(OWNER_IS_REVIEWER_MESSAGE);
  }

  let code = current.code;
  try {
    await db.transaction(async tx => {
      if (current.projectId !== data.projectId) {
        await lockDrawingCodes(tx, data.projectId);
        code = await drawingCodeInProject(tx, { id, code: current.code, name: data.name }, data.projectId);
        if (code !== current.code) changes.unshift(`Code: ${current.code} → ${code}`);
      }
      await tx.update(drawings).set({
        ...data,
        code,
        lastModifiedById: session.user.id,
        updatedAt: new Date(),
      }).where(eq(drawings.id, id));
      await tx.insert(drawingEvents).values({
        drawingId: id,
        revisionId: rev.id,
        kind: "updated",
        body: changes.join("\n"),
        actorId: session.user.id,
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(CODE_RACE_ERROR);
    throw e;
  }

  revalidateDrawing(id, current.projectId, data.projectId);
  await audit({
    kind: "drawing.updated",
    refType: "drawing",
    refId: id,
    summary: `${code} updated — ${changes.map(c => c.split(":")[0]).join(", ").toLowerCase()}`,
    payload: { projectId: data.projectId, changes },
  });
  return { ok: true };
}

const IdInput = z.object({ id: Id });

export async function deleteDrawing(input: z.infer<typeof IdInput>): Promise<DrawingActionResult> {
  const { id } = IdInput.parse(input);
  const session = await requireSession();
  if (!isAdmin(session.user)) return fail(ADMIN_ONLY_ERROR);
  const [d] = await db
    .update(drawings)
    .set({ deletedAt: new Date(), lastModifiedById: session.user.id, updatedAt: new Date() })
    .where(and(eq(drawings.id, id), isNull(drawings.deletedAt)))
    .returning({ code: drawings.code, name: drawings.name, projectId: drawings.projectId });
  if (!d) return fail("Drawing not found.");

  revalidateDrawing(id, d.projectId);
  await audit({
    kind: "drawing.deleted",
    refType: "drawing",
    refId: id,
    summary: `${d.code} — ${d.name} deleted`,
    payload: { projectId: d.projectId },
  });
  return { ok: true };
}

const NewRevisionInput = z.object({
  drawingId: Id,
  commitMessage: z.string().trim().min(1).max(2000),
  /** False for a revision that doesn't touch the BOM — BOMs built from earlier revisions stay current. */
  bomImpact: z.boolean().default(true),
});

export async function createDrawingRevision(
  input: z.input<typeof NewRevisionInput>,
): Promise<DrawingActionResult<{ number: number }>> {
  const { drawingId, commitMessage, bomImpact } = NewRevisionInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const [d] = await db
    .select({ code: drawings.code, projectId: drawings.projectId })
    .from(drawings)
    .where(and(eq(drawings.id, drawingId), isNull(drawings.deletedAt)))
    .limit(1);
  if (!d) return fail("Drawing not found.");
  const prev = await latestRevision(drawingId);
  const number = (prev?.number ?? 0) + 1;

  try {
    await db.transaction(async tx => {
      if (prev) {
        await tx.update(drawingRevisions)
          .set({ lockedAt: new Date(), updatedAt: new Date() })
          .where(eq(drawingRevisions.id, prev.id));
      }
      const [rev] = await tx.insert(drawingRevisions).values({
        drawingId,
        number,
        commitMessage,
        bomImpact,
        createdById: session.user.id,
      }).returning({ id: drawingRevisions.id });
      await tx.insert(drawingEvents).values({
        drawingId,
        revisionId: rev.id,
        kind: "created",
        toStatus: "in-progress",
        actorId: session.user.id,
      });
      await tx.update(drawings)
        .set({ lastModifiedById: session.user.id, updatedAt: new Date() })
        .where(eq(drawings.id, drawingId));
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("Someone else just created a revision — refresh the page.");
    throw e;
  }

  revalidateDrawing(drawingId, d.projectId);
  await audit({
    kind: "drawing.revision.created",
    refType: "drawing",
    refId: drawingId,
    summary: `${d.code} ${formatDrawingRevision(number)} created${bomImpact ? "" : " — no BOM change"}`,
    payload: { projectId: d.projectId, number, commitMessage, bomImpact },
  });
  return { ok: true, number };
}

const BomImpactInput = z.object({ revisionId: Id, bomImpact: z.boolean() });

/** Corrects whether the current revision changes the BOM; older revisions are locked. */
export async function setDrawingRevisionBomImpact(input: z.infer<typeof BomImpactInput>): Promise<DrawingActionResult> {
  const { revisionId, bomImpact } = BomImpactInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const [rev] = await db
    .select({
      drawingId: drawingRevisions.drawingId,
      number: drawingRevisions.number,
      bomImpact: drawingRevisions.bomImpact,
      code: drawings.code,
      projectId: drawings.projectId,
    })
    .from(drawingRevisions)
    .innerJoin(drawings, eq(drawings.id, drawingRevisions.drawingId))
    .where(and(eq(drawingRevisions.id, revisionId), isNull(drawings.deletedAt)))
    .limit(1);
  if (!rev) return fail("Revision not found.");
  const latest = await latestRevision(rev.drawingId);
  if (latest?.id !== revisionId) return fail("Only the current revision can change — older revisions are locked.");
  if (rev.bomImpact === bomImpact) return { ok: true };

  const label = (v: boolean) => (v ? "changes the BOM" : "no BOM change");
  await db.transaction(async tx => {
    await tx.update(drawingRevisions)
      .set({ bomImpact, updatedAt: new Date() })
      .where(eq(drawingRevisions.id, revisionId));
    await tx.insert(drawingEvents).values({
      drawingId: rev.drawingId,
      revisionId,
      kind: "updated",
      body: `BOM impact: ${label(rev.bomImpact)} → ${label(bomImpact)}`,
      actorId: session.user.id,
    });
    await tx.update(drawings)
      .set({ lastModifiedById: session.user.id, updatedAt: new Date() })
      .where(eq(drawings.id, rev.drawingId));
  });

  revalidateDrawing(rev.drawingId, rev.projectId);
  revalidatePath("/dashboard");
  await audit({
    kind: "drawing.revision.bom_impact",
    refType: "drawing",
    refId: rev.drawingId,
    summary: `${rev.code} ${formatDrawingRevision(rev.number)} marked as ${bomImpact ? "changing the BOM" : "no BOM change"}`,
    payload: { projectId: rev.projectId, revisionId, bomImpact },
  });
  return { ok: true };
}

const StatusInput = z.object({
  revisionId: Id,
  to: z.enum(DRAWING_STATUSES),
  comment: z.string().trim().max(2000).optional(),
  reviewerId: Id.optional(),
});

const REVIEWER_NOT_ELIGIBLE = "The approving engineer must be an active user who isn't a viewer.";
const STATUS_RACE_ERROR = "The status was just changed by someone else — refresh the page.";

/** A drawing's latest revision, as a status change reads and writes it. */
type StatusTarget = {
  revisionId: string;
  number: number;
  status: DrawingStatus;
  drawingId: string;
  code: string;
  projectId: string;
};

type StatusWrite = {
  to: DrawingStatus;
  kind: TransitionKind;
  resetsReview: boolean;
  nextReviewerId: string | null;
  comment: string | null;
  actorId: string;
};

/**
 * Saves a status change `checkDrawingTransition` allowed. The update only moves
 * the revision from the status that was checked, so `false` means someone else
 * changed it in between and nothing was written.
 */
async function writeStatusChange(t: StatusTarget, w: StatusWrite, now: Date): Promise<boolean> {
  return db.transaction(async tx => {
    const [row] = await tx.update(drawingRevisions)
      .set({
        status: w.to,
        updatedAt: now,
        ...(w.kind === "request" ? { reviewerId: w.nextReviewerId } : {}),
        ...(w.resetsReview ? { reviewedById: null, reviewedAt: null } : {}),
        ...(w.kind === "approve" ? { reviewedById: w.actorId, reviewedAt: now } : {}),
      })
      .where(and(eq(drawingRevisions.id, t.revisionId), eq(drawingRevisions.status, t.status)))
      .returning({ id: drawingRevisions.id });
    if (!row) return false;
    await tx.insert(drawingEvents).values({
      drawingId: t.drawingId,
      revisionId: t.revisionId,
      kind: "status",
      fromStatus: t.status,
      toStatus: w.to,
      body: w.comment,
      actorId: w.actorId,
    });
    await tx.update(drawings)
      .set({ lastModifiedById: w.actorId, updatedAt: now })
      .where(eq(drawings.id, t.drawingId));
    return true;
  });
}

async function auditStatusChange(t: StatusTarget, to: DrawingStatus, comment: string | null, bulk = false) {
  await audit({
    kind: "drawing.status.changed",
    refType: "drawing",
    refId: t.drawingId,
    summary: `${t.code} ${formatDrawingRevision(t.number)}: ${DRAWING_STATUS_LABEL[t.status]} → ${DRAWING_STATUS_LABEL[to]}`,
    payload: { projectId: t.projectId, revisionId: t.revisionId, from: t.status, to, comment, ...(bulk ? { bulk } : {}) },
  });
}

export async function changeDrawingStatus(input: z.infer<typeof StatusInput>): Promise<DrawingActionResult> {
  const data = StatusInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const comment = data.comment || null;

  const [rev] = await db
    .select({
      revisionId: drawingRevisions.id,
      number: drawingRevisions.number,
      status: drawingRevisions.status,
      reviewerId: drawingRevisions.reviewerId,
      reviewedAt: drawingRevisions.reviewedAt,
      drawingId: drawings.id,
      code: drawings.code,
      projectId: drawings.projectId,
      ownerId: drawings.ownerId,
    })
    .from(drawingRevisions)
    .innerJoin(drawings, eq(drawings.id, drawingRevisions.drawingId))
    .where(and(eq(drawingRevisions.id, data.revisionId), isNull(drawings.deletedAt)))
    .limit(1);
  if (!rev) return fail("Revision not found.");

  const latest = await latestRevision(rev.drawingId);
  const nextReviewerId = data.to === "need-approval" ? data.reviewerId ?? null : null;
  if (nextReviewerId && !(await findActiveEngineer(nextReviewerId))) return fail(REVIEWER_NOT_ELIGIBLE);

  const check = checkDrawingTransition({
    from: rev.status,
    to: data.to,
    actorId: session.user.id,
    ownerId: rev.ownerId,
    reviewerId: rev.reviewerId,
    nextReviewerId,
    reviewed: rev.reviewedAt !== null,
    isLatest: latest?.id === rev.revisionId,
    comment,
  });
  if (!check.ok) return fail(TRANSITION_ERROR_MESSAGE[check.error]);

  const write = { to: data.to, kind: check.kind, resetsReview: check.resetsReview, nextReviewerId, comment, actorId: session.user.id };
  if (!(await writeStatusChange(rev, write, new Date()))) return fail(STATUS_RACE_ERROR);

  revalidateDrawing(rev.drawingId, rev.projectId);
  await auditStatusChange(rev, data.to, comment);

  const notice = {
    revisionId: rev.revisionId,
    from: rev.status,
    to: data.to,
    kind: check.kind,
    comment,
    actorId: session.user.id,
    actorName: session.user.name || session.user.email,
  };
  after(() => notifyDrawingStatusChange(notice));

  return { ok: true };
}

// ── Bulk edits from the /drawings list ─────────────────────────────────────
// Each selected drawing is checked with the same rules as a single edit
// (`src/lib/drawing-bulk.ts`); the ones that can't change are skipped and
// reported, the rest are saved one by one with their own history and audit.

export type BulkDrawingResult = DrawingActionResult<{ updated: string[]; skipped: BulkSkip[] }>;

const BulkIds = z.array(Id).min(1).max(MAX_BULK_DRAWINGS).transform(ids => [...new Set(ids)]);

const NOT_FOUND_SKIP = "Not found — it may have been deleted.";

/** The selected drawings with their latest revision; deleted ones come back as skipped. */
async function loadBulkDrawings(ids: string[]) {
  const latest = db
    .selectDistinctOn([drawingRevisions.drawingId], {
      drawingId: drawingRevisions.drawingId,
      revisionId: drawingRevisions.id,
      number: drawingRevisions.number,
      status: drawingRevisions.status,
      reviewerId: drawingRevisions.reviewerId,
      reviewedById: drawingRevisions.reviewedById,
      reviewedAt: drawingRevisions.reviewedAt,
    })
    .from(drawingRevisions)
    .where(inArray(drawingRevisions.drawingId, ids))
    .orderBy(drawingRevisions.drawingId, desc(drawingRevisions.number))
    .as("latest");
  const rows = await db
    .select({
      id: drawings.id,
      drawingId: drawings.id,
      code: drawings.code,
      projectId: drawings.projectId,
      ownerId: drawings.ownerId,
      dueDate: drawings.dueDate,
      revisionId: latest.revisionId,
      number: latest.number,
      status: latest.status,
      reviewerId: latest.reviewerId,
      reviewedById: latest.reviewedById,
      reviewedAt: latest.reviewedAt,
    })
    .from(drawings)
    .innerJoin(latest, eq(latest.drawingId, drawings.id))
    .where(and(inArray(drawings.id, ids), isNull(drawings.deletedAt)));

  const found = new Set(rows.map(r => r.id));
  return {
    rows: rows.map(r => ({ ...r, reviewed: r.reviewedAt !== null })),
    missing: ids.filter(id => !found.has(id)).map((id): BulkSkip => ({ id, code: "", reason: NOT_FOUND_SKIP })),
  };
}

type BulkRow = Awaited<ReturnType<typeof loadBulkDrawings>>["rows"][number];

function revalidateDrawings(rows: { id: string; projectId: string }[]) {
  if (rows.length === 0) return;
  revalidatePath("/drawings");
  for (const r of rows) revalidatePath(`/drawings/${r.id}`);
  for (const p of new Set(rows.map(r => r.projectId))) revalidatePath(`/projects/${p}`);
}

const BulkStatusInput = z.object({
  ids: BulkIds,
  to: z.enum(DRAWING_STATUSES),
  comment: z.string().trim().max(2000).optional(),
  reviewerId: Id.optional(),
});

/** One status for every selected drawing's latest revision; each follower gets one email for all of them. */
export async function bulkChangeDrawingStatus(input: z.input<typeof BulkStatusInput>): Promise<BulkDrawingResult> {
  const data = BulkStatusInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const comment = data.comment || null;
  const actorId = session.user.id;

  const nextReviewerId = data.to === "need-approval" ? data.reviewerId ?? null : null;
  if (data.to === "need-approval") {
    // These would skip every drawing, so they are answered once.
    if (!nextReviewerId) return fail(TRANSITION_ERROR_MESSAGE.REVIEWER_REQUIRED);
    if (nextReviewerId === actorId) return fail(TRANSITION_ERROR_MESSAGE.REVIEWER_IS_REQUESTER);
    if (!(await findActiveEngineer(nextReviewerId))) return fail(REVIEWER_NOT_ELIGIBLE);
  }

  const { rows, missing } = await loadBulkDrawings(data.ids);
  const plan = planBulkStatus(rows, { to: data.to, actorId, nextReviewerId, comment });
  const skipped = [...missing, ...plan.skipped];
  const done: BulkRow[] = [];
  const notices: DrawingStatusNotice[] = [];
  const now = new Date();

  for (const { row, kind, resetsReview } of plan.ready) {
    if (!(await writeStatusChange(row, { to: data.to, kind, resetsReview, nextReviewerId, comment, actorId }, now))) {
      skipped.push({ id: row.id, code: row.code, reason: STATUS_RACE_ERROR });
      continue;
    }
    await auditStatusChange(row, data.to, comment, true);
    done.push(row);
    notices.push({
      revisionId: row.revisionId,
      from: row.status,
      to: data.to,
      kind,
      comment,
      actorId,
      actorName: session.user.name || session.user.email,
    });
  }

  revalidateDrawings(done);
  if (notices.length) after(() => notifyDrawingStatusChanges(notices));
  return { ok: true, updated: done.map(r => r.id), skipped };
}

/**
 * Saves one field of a bulk edit with its history line, the way `updateDrawing`
 * records it. `false` when the drawing was deleted in the meantime.
 */
async function writeBulkFieldChange(
  row: BulkRow,
  set: Pick<typeof drawings.$inferInsert, "ownerId" | "dueDate">,
  change: string,
  actorId: string,
  now: Date,
): Promise<boolean> {
  const written = await db.transaction(async tx => {
    const [d] = await tx.update(drawings)
      .set({ ...set, lastModifiedById: actorId, updatedAt: now })
      .where(and(eq(drawings.id, row.id), isNull(drawings.deletedAt)))
      .returning({ id: drawings.id });
    if (!d) return false;
    await tx.insert(drawingEvents).values({
      drawingId: row.id,
      revisionId: row.revisionId,
      kind: "updated",
      body: change,
      actorId,
    });
    return true;
  });
  if (!written) return false;
  await audit({
    kind: "drawing.updated",
    refType: "drawing",
    refId: row.id,
    summary: `${row.code} updated — ${change.split(":")[0].toLowerCase()}`,
    payload: { projectId: row.projectId, changes: [change], bulk: true },
  });
  return true;
}

const BulkOwnerInput = z.object({ ids: BulkIds, ownerId: Id });

export async function bulkSetDrawingOwner(input: z.input<typeof BulkOwnerInput>): Promise<BulkDrawingResult> {
  const { ids, ownerId } = BulkOwnerInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const owner = await findActiveEngineer(ownerId);
  if (!owner) return fail("The owner must be an active user who isn't a viewer.");

  const { rows, missing } = await loadBulkDrawings(ids);
  const plan = planBulkOwner(rows, ownerId);
  const skipped = [...missing, ...plan.skipped];

  const previousIds = [...new Set(plan.ready.map(r => r.ownerId).filter((id): id is string => !!id))];
  const previous = previousIds.length
    ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, previousIds))
    : [];
  const nameOf = new Map(previous.map(u => [u.id, u.name]));

  const done: BulkRow[] = [];
  const now = new Date();
  for (const row of plan.ready) {
    const change = `Owner: ${(row.ownerId && nameOf.get(row.ownerId)) || "—"} → ${owner.name}`;
    if (await writeBulkFieldChange(row, { ownerId }, change, session.user.id, now)) done.push(row);
    else skipped.push({ id: row.id, code: row.code, reason: NOT_FOUND_SKIP });
  }

  revalidateDrawings(done);
  return { ok: true, updated: done.map(r => r.id), skipped };
}

const BulkDueDateInput = z.object({
  ids: BulkIds,
  /** null clears the due date. */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function bulkSetDrawingDueDate(input: z.input<typeof BulkDueDateInput>): Promise<BulkDrawingResult> {
  const { ids, dueDate } = BulkDueDateInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const { rows, missing } = await loadBulkDrawings(ids);
  const plan = planBulkDueDate(rows, dueDate);
  const skipped = [...missing, ...plan.skipped];

  const done: BulkRow[] = [];
  const now = new Date();
  for (const row of plan.ready) {
    const change = `Due date: ${row.dueDate ?? "—"} → ${dueDate ?? "—"}`;
    if (await writeBulkFieldChange(row, { dueDate }, change, session.user.id, now)) done.push(row);
    else skipped.push({ id: row.id, code: row.code, reason: NOT_FOUND_SKIP });
  }

  revalidateDrawings(done);
  return { ok: true, updated: done.map(r => r.id), skipped };
}

const CommentInput = z.object({
  revisionId: Id,
  body: z.string().trim().min(1).max(4000),
});

export async function addDrawingComment(input: z.infer<typeof CommentInput>): Promise<DrawingActionResult> {
  const { revisionId, body } = CommentInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const [rev] = await db
    .select({ number: drawingRevisions.number, drawingId: drawings.id, code: drawings.code, projectId: drawings.projectId })
    .from(drawingRevisions)
    .innerJoin(drawings, eq(drawings.id, drawingRevisions.drawingId))
    .where(and(eq(drawingRevisions.id, revisionId), isNull(drawings.deletedAt)))
    .limit(1);
  if (!rev) return fail("Revision not found.");

  await db.insert(drawingEvents).values({
    drawingId: rev.drawingId,
    revisionId,
    kind: "comment",
    body,
    actorId: session.user.id,
  });

  revalidatePath(`/drawings/${rev.drawingId}`);
  await audit({
    kind: "drawing.comment.added",
    refType: "drawing",
    refId: rev.drawingId,
    summary: `Comment on ${rev.code} ${formatDrawingRevision(rev.number)}`,
    payload: { projectId: rev.projectId, revisionId },
  });
  return { ok: true };
}
