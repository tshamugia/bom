"use server";

import { z } from "zod";
import { and, count, desc, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { boms, bomRevisions, bomLines, user } from "@/db/schema";
import { EDITOR_ROLES, READ_ONLY_ERROR, canEdit } from "@/lib/roles";
import {
  BOM_STATUS_ERROR_MESSAGE, BOM_STATUS_LABEL, REVISION_STATUSES, checkBomStatusChange,
} from "@/lib/bom-status";
import { requireRole, requireSession } from "../auth-context";
import { audit } from "../audit";
import { isRevisionImmutable, revisionSentSql } from "../lib/revision-status";
import { copyDrawingLinks, copyRevisionContentRefreshed } from "../lib/copy-revision";
import { touchBom } from "../lib/touch-bom";

async function loadRevision(revisionId: string) {
  await requireRole(...EDITOR_ROLES);
  const [row] = await db
    .select({
      id: bomRevisions.id,
      status: bomRevisions.status,
      letter: bomRevisions.letter,
      ownerId: bomRevisions.ownerId,
      bomId: bomRevisions.bomId,
      bomOwnerId: boms.ownerId,
      projectId: boms.projectId,
    })
    .from(bomRevisions)
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .where(eq(bomRevisions.id, revisionId))
    .limit(1);
  if (!row) throw new Error("REVISION_NOT_FOUND");
  return row;
}

const CommitInput = z.object({
  revisionId: z.string(),
  commitMessage: z.string().trim().max(2000).optional(),
});

export async function commitRevision(input: z.infer<typeof CommitInput>) {
  const { revisionId, commitMessage } = CommitInput.parse(input);
  const rev = await loadRevision(revisionId);
  if (rev.status !== "draft") throw new Error("REVISION_NOT_DRAFT");

  const [{ n }] = await db
    .select({ n: count() })
    .from(bomLines)
    .where(eq(bomLines.revisionId, revisionId));
  if (n === 0) throw new Error("EMPTY_REVISION");

  const session = await requireRole(...EDITOR_ROLES);
  await db
    .update(bomRevisions)
    .set({
      status: "committed",
      committedById: session.user.id,
      committedAt: new Date(),
      commitMessage: commitMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bomRevisions.id, revisionId));

  await touchBom(db, rev.bomId, session.user.id);
  revalidatePath(`/builder/${rev.projectId}/${rev.bomId}`);
  revalidatePath(`/projects/${rev.projectId}/history`);
  revalidatePath(`/projects/${rev.projectId}`);
  revalidatePath("/dashboard");
  await audit({
    kind: "bom.revision.committed",
    refType: "bom",
    refId: rev.bomId,
    summary: `Rev ${rev.letter} committed`,
    payload: { revisionId, letter: rev.letter, projectId: rev.projectId, commitMessage: commitMessage ?? null },
  });
}

const BranchInput = z.object({
  parentRevisionId: z.string(),
  /**
   * A BOM's owner changes only here, together with a new revision. Omitted (or
   * the current owner) keeps the owner — the person branching doesn't take it over.
   */
  ownerId: z.string().min(1).optional(),
});

/** BOM owners must be active editors — viewers can't change a BOM. */
async function findActiveEditor(id: string) {
  const [u] = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.id, id), eq(user.disabled, false), ne(user.role, "viewer")))
    .limit(1);
  return u ?? null;
}

async function userName(id: string | null) {
  if (!id) return null;
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, id)).limit(1);
  return u?.name ?? null;
}

function nextLetter(existing: string[]): string {
  const used = new Set(existing);
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!used.has(c)) return c;
  }
  for (let i = 0; i < 26; i++)
    for (let j = 0; j < 26; j++) {
      const c = `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + j)}`;
      if (!used.has(c)) return c;
    }
  throw new Error("REVISION_LETTER_EXHAUSTED");
}

export async function branchRevision(input: z.infer<typeof BranchInput>): Promise<string> {
  const { parentRevisionId, ownerId: requestedOwnerId } = BranchInput.parse(input);
  const parent = await loadRevision(parentRevisionId);
  if (!isRevisionImmutable(parent.status) || parent.status === "draft") {
    throw new Error("PARENT_NOT_COMMITTED");
  }

  const [{ draftCount }] = await db
    .select({ draftCount: count() })
    .from(bomRevisions)
    .where(and(eq(bomRevisions.bomId, parent.bomId), eq(bomRevisions.status, "draft")));
  if (draftCount > 0) throw new Error("DRAFT_ALREADY_EXISTS");

  const session = await requireRole(...EDITOR_ROLES);
  const currentOwnerId = parent.bomOwnerId ?? parent.ownerId ?? session.user.id;
  const ownerId = requestedOwnerId ?? currentOwnerId;
  const ownerChanged = ownerId !== currentOwnerId;
  const newOwner = ownerChanged ? await findActiveEditor(ownerId) : null;
  if (ownerChanged && !newOwner) throw new Error("OWNER_NOT_ELIGIBLE");

  const existing = await db
    .select({ letter: bomRevisions.letter })
    .from(bomRevisions)
    .where(eq(bomRevisions.bomId, parent.bomId));
  const letter = nextLetter(existing.map(e => e.letter));

  const newId = await db.transaction(async tx => {
    const [child] = await tx.insert(bomRevisions).values({
      bomId: parent.bomId,
      parentRevisionId: parent.id,
      letter,
      status: "draft",
      ownerId,
    }).returning();
    if (parent.bomOwnerId !== ownerId) {
      await tx.update(boms).set({ ownerId }).where(eq(boms.id, parent.bomId));
    }

    await copyRevisionContentRefreshed(tx, parent.id, child.id);
    await copyDrawingLinks(tx, parent.id, child.id, session.user.id);
    await touchBom(tx, parent.bomId, session.user.id);
    return child.id;
  });

  const previousOwnerName = ownerChanged ? await userName(currentOwnerId) : null;
  revalidatePath("/builder");
  revalidatePath(`/builder/${parent.projectId}/${parent.bomId}`);
  revalidatePath(`/projects/${parent.projectId}/history`);
  revalidatePath(`/projects/${parent.projectId}`);
  revalidatePath("/dashboard");
  await audit({
    kind: "bom.revision.branched",
    refType: "bom",
    refId: parent.bomId,
    summary: newOwner
      ? `Rev ${letter} branched from Rev ${parent.letter} · owner ${previousOwnerName ?? "—"} → ${newOwner.name}`
      : `Rev ${letter} branched from Rev ${parent.letter}`,
    payload: {
      parentRevisionId: parent.id,
      newRevisionId: newId,
      letter,
      projectId: parent.projectId,
      ownerId,
      ...(ownerChanged ? { previousOwnerId: currentOwnerId } : {}),
    },
  });
  return newId;
}

const DiscardInput = z.object({ revisionId: z.string() });

export async function discardDraft(input: z.infer<typeof DiscardInput>) {
  const { revisionId } = DiscardInput.parse(input);
  const rev = await loadRevision(revisionId);
  if (rev.status !== "draft") throw new Error("REVISION_NOT_DRAFT");

  const session = await requireRole(...EDITOR_ROLES);
  await db.delete(bomRevisions).where(eq(bomRevisions.id, revisionId));

  await touchBom(db, rev.bomId, session.user.id);
  revalidatePath(`/builder/${rev.projectId}/${rev.bomId}`);
  revalidatePath(`/projects/${rev.projectId}/history`);
  revalidatePath(`/projects/${rev.projectId}`);
  revalidatePath("/dashboard");
  await audit({
    kind: "bom.revision.discarded",
    refType: "bom",
    refId: rev.bomId,
    summary: `Rev ${rev.letter} draft discarded`,
    payload: { revisionId, letter: rev.letter, projectId: rev.projectId },
  });
}

const StatusInput = z.object({
  revisionId: z.string().min(1),
  to: z.enum(REVISION_STATUSES),
  comment: z.string().trim().max(2000),
});

export type RevisionStatusResult = { ok: true } | { ok: false; error: string };

/**
 * Sets the client's approval on a committed revision, or takes it back — by
 * hand, with a comment saying who confirmed it. Like "No BOM change", it's a
 * metadata write on an immutable revision: the lines never change.
 */
export async function changeRevisionStatus(input: z.input<typeof StatusInput>): Promise<RevisionStatusResult> {
  const data = StatusInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return { ok: false, error: READ_ONLY_ERROR };

  const [rev] = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      sent: revisionSentSql(bomRevisions.id),
      bomId: boms.id,
      bomName: boms.name,
      projectId: boms.projectId,
    })
    .from(bomRevisions)
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .where(and(eq(bomRevisions.id, data.revisionId), isNull(boms.deletedAt)))
    .limit(1);
  if (!rev) return { ok: false, error: "Revision not found." };

  // An open draft on top doesn't count: the client may approve Rev A while Rev B is being drawn up.
  const [latest] = await db
    .select({ id: bomRevisions.id })
    .from(bomRevisions)
    .where(and(eq(bomRevisions.bomId, rev.bomId), ne(bomRevisions.status, "draft")))
    .orderBy(desc(bomRevisions.createdAt))
    .limit(1);

  const check = checkBomStatusChange({
    from: rev.status,
    to: data.to,
    sent: rev.sent,
    isLatest: latest?.id === rev.id,
    comment: data.comment,
  });
  if (!check.ok) return { ok: false, error: BOM_STATUS_ERROR_MESSAGE[check.error] };

  const now = new Date();
  const updated = await db.transaction(async tx => {
    const [row] = await tx
      .update(bomRevisions)
      .set({
        status: data.to,
        statusChangedById: session.user.id,
        statusChangedAt: now,
        statusComment: data.comment,
        updatedAt: now,
      })
      // Guard against a concurrent change: only move from the status we checked.
      .where(and(eq(bomRevisions.id, rev.id), eq(bomRevisions.status, rev.status)))
      .returning({ id: bomRevisions.id });
    if (!row) return false;
    await touchBom(tx, rev.bomId, session.user.id);
    return true;
  });
  if (!updated) return { ok: false, error: "The status was just changed by someone else — refresh the page." };

  revalidatePath("/builder");
  revalidatePath(`/builder/${rev.projectId}/${rev.bomId}`);
  revalidatePath(`/preview/${rev.projectId}/${rev.bomId}`);
  revalidatePath(`/projects/${rev.projectId}`);
  revalidatePath(`/projects/${rev.projectId}/history`);
  revalidatePath("/dashboard");
  await audit({
    kind: "bom.status.changed",
    refType: "bom",
    refId: rev.bomId,
    summary: `${rev.bomName} Rev ${rev.letter}: ${BOM_STATUS_LABEL[rev.status]} → ${BOM_STATUS_LABEL[data.to]} — ${data.comment}`,
    payload: {
      projectId: rev.projectId,
      revisionId: rev.id,
      letter: rev.letter,
      from: rev.status,
      to: data.to,
      comment: data.comment,
    },
  });
  return { ok: true };
}
