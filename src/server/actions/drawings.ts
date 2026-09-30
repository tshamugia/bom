"use server";

import { z } from "zod";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
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
} from "@/lib/drawing-status";
import { MAX_ESTIMATE_HOURS, formatHours } from "@/lib/drawing-meta";
import { ADMIN_ONLY_ERROR, READ_ONLY_ERROR, canEdit, isAdmin } from "@/lib/roles";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { notifyDrawingStatusChange } from "../lib/drawing-notify";

// Expected failures are returned, not thrown: Next.js hides thrown messages
// from the client in production, and these are meant to be read by the user.
export type DrawingActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

const Id = z.string().min(1);

const DrawingFields = z.object({
  projectId: Id,
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  disciplineId: Id,
  ownerId: Id,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  estimatedHours: z.number().positive().max(MAX_ESTIMATE_HOURS).nullable(),
});

function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown) => (typeof x === "object" && x && "code" in x ? (x as { code: unknown }).code : null);
  return code(e) === "23505" || code((e as { cause?: unknown } | null)?.cause) === "23505";
}

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

async function isCodeTaken(projectId: string, code: string, exceptId?: string) {
  const [hit] = await db
    .select({ id: drawings.id })
    .from(drawings)
    .where(and(
      eq(drawings.projectId, projectId),
      sql`lower(${drawings.code}) = lower(${code})`,
      isNull(drawings.deletedAt),
      exceptId ? ne(drawings.id, exceptId) : undefined,
    ))
    .limit(1);
  return !!hit;
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

export async function createDrawing(input: z.infer<typeof CreateInput>): Promise<DrawingActionResult<{ id: string }>> {
  const data = CreateInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const project = await findProject(data.projectId);
  if (!project) return fail("Project not found.");
  if (!(await findDiscipline(data.disciplineId))) return fail("Discipline not found.");
  if (!(await findActiveEngineer(data.ownerId))) return fail("The owner must be an active user who isn't a viewer.");
  if (await isCodeTaken(data.projectId, data.code)) return fail(`Code ${data.code} is already used in ${project.code}.`);

  let id: string;
  try {
    id = await db.transaction(async tx => {
      const [d] = await tx.insert(drawings).values({
        projectId: data.projectId,
        code: data.code,
        name: data.name,
        disciplineId: data.disciplineId,
        ownerId: data.ownerId,
        dueDate: data.dueDate,
        estimatedHours: data.estimatedHours,
        createdById: session.user.id,
        lastModifiedById: session.user.id,
      }).returning({ id: drawings.id });
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
      return d.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(`Code ${data.code} is already used in ${project.code}.`);
    throw e;
  }

  revalidateDrawing(id, data.projectId);
  await audit({
    kind: "drawing.created",
    refType: "drawing",
    refId: id,
    summary: `${project.code} · ${data.code} — ${data.name} created`,
    payload: { projectId: data.projectId, code: data.code },
  });
  return { ok: true, id };
}

const UpdateInput = DrawingFields.extend({ id: Id });

export async function updateDrawing(input: z.infer<typeof UpdateInput>): Promise<DrawingActionResult> {
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
  if (await isCodeTaken(data.projectId, data.code, id)) return fail(`Code ${data.code} is already used in ${project.code}.`);

  const changes: string[] = [];
  if (current.code !== data.code) changes.push(`Code: ${current.code} → ${data.code}`);
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
  if (changes.length === 0) return { ok: true };

  const rev = await latestRevision(id);
  if (!rev) return fail("Drawing has no revisions.");
  if (current.ownerId !== data.ownerId && isOwnerChangeBlocked({ newOwnerId: data.ownerId, ...rev })) {
    return fail(OWNER_IS_REVIEWER_MESSAGE);
  }

  try {
    await db.transaction(async tx => {
      await tx.update(drawings).set({
        ...data,
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
    if (isUniqueViolation(e)) return fail(`Code ${data.code} is already used in ${project.code}.`);
    throw e;
  }

  revalidateDrawing(id, current.projectId, data.projectId);
  await audit({
    kind: "drawing.updated",
    refType: "drawing",
    refId: id,
    summary: `${data.code} updated — ${changes.map(c => c.split(":")[0]).join(", ").toLowerCase()}`,
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
});

export async function createDrawingRevision(
  input: z.infer<typeof NewRevisionInput>,
): Promise<DrawingActionResult<{ number: number }>> {
  const { drawingId, commitMessage } = NewRevisionInput.parse(input);
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
    summary: `${d.code} ${formatDrawingRevision(number)} created`,
    payload: { projectId: d.projectId, number, commitMessage },
  });
  return { ok: true, number };
}

const StatusInput = z.object({
  revisionId: Id,
  to: z.enum(DRAWING_STATUSES),
  comment: z.string().trim().max(2000).optional(),
  reviewerId: Id.optional(),
});

export async function changeDrawingStatus(input: z.infer<typeof StatusInput>): Promise<DrawingActionResult> {
  const data = StatusInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  const comment = data.comment || null;

  const [rev] = await db
    .select({
      id: drawingRevisions.id,
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
  if (nextReviewerId && !(await findActiveEngineer(nextReviewerId))) {
    return fail("The approving engineer must be an active user who isn't a viewer.");
  }

  const check = checkDrawingTransition({
    from: rev.status,
    to: data.to,
    actorId: session.user.id,
    ownerId: rev.ownerId,
    reviewerId: rev.reviewerId,
    nextReviewerId,
    reviewed: rev.reviewedAt !== null,
    isLatest: latest?.id === rev.id,
    comment,
  });
  if (!check.ok) return fail(TRANSITION_ERROR_MESSAGE[check.error]);

  const now = new Date();
  const updated = await db.transaction(async tx => {
    const [row] = await tx.update(drawingRevisions)
      .set({
        status: data.to,
        updatedAt: now,
        ...(check.kind === "request" ? { reviewerId: nextReviewerId } : {}),
        ...(check.resetsReview ? { reviewedById: null, reviewedAt: null } : {}),
        ...(check.kind === "approve" ? { reviewedById: session.user.id, reviewedAt: now } : {}),
      })
      // Guard against a concurrent change: only move from the status we checked.
      .where(and(eq(drawingRevisions.id, rev.id), eq(drawingRevisions.status, rev.status)))
      .returning({ id: drawingRevisions.id });
    if (!row) return false;
    await tx.insert(drawingEvents).values({
      drawingId: rev.drawingId,
      revisionId: rev.id,
      kind: "status",
      fromStatus: rev.status,
      toStatus: data.to,
      body: comment,
      actorId: session.user.id,
    });
    await tx.update(drawings)
      .set({ lastModifiedById: session.user.id, updatedAt: now })
      .where(eq(drawings.id, rev.drawingId));
    return true;
  });
  if (!updated) return fail("The status was just changed by someone else — refresh the page.");

  revalidateDrawing(rev.drawingId, rev.projectId);
  await audit({
    kind: "drawing.status.changed",
    refType: "drawing",
    refId: rev.drawingId,
    summary: `${rev.code} ${formatDrawingRevision(rev.number)}: ${DRAWING_STATUS_LABEL[rev.status]} → ${DRAWING_STATUS_LABEL[data.to]}`,
    payload: { projectId: rev.projectId, revisionId: rev.id, from: rev.status, to: data.to, comment },
  });

  const notice = {
    revisionId: rev.id,
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
