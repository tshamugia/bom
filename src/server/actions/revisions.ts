"use server";

import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { boms, bomRevisions, bomLines } from "@/db/schema";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { isRevisionImmutable } from "../lib/revision-status";
import { copyRevisionContentRefreshed } from "../lib/copy-revision";
import { touchBom } from "../lib/touch-bom";

async function loadRevision(revisionId: string) {
  await requireSession();
  const [row] = await db
    .select({
      id: bomRevisions.id,
      status: bomRevisions.status,
      letter: bomRevisions.letter,
      bomId: bomRevisions.bomId,
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

  const session = await requireSession();
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

const BranchInput = z.object({ parentRevisionId: z.string() });

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
  const { parentRevisionId } = BranchInput.parse(input);
  const parent = await loadRevision(parentRevisionId);
  if (!isRevisionImmutable(parent.status) || parent.status === "draft") {
    throw new Error("PARENT_NOT_COMMITTED");
  }

  const [{ draftCount }] = await db
    .select({ draftCount: count() })
    .from(bomRevisions)
    .where(and(eq(bomRevisions.bomId, parent.bomId), eq(bomRevisions.status, "draft")));
  if (draftCount > 0) throw new Error("DRAFT_ALREADY_EXISTS");

  const session = await requireSession();
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
      ownerId: session.user.id,
    }).returning();

    await copyRevisionContentRefreshed(tx, parent.id, child.id);
    await touchBom(tx, parent.bomId, session.user.id);
    return child.id;
  });

  revalidatePath(`/builder/${parent.projectId}/${parent.bomId}`);
  revalidatePath(`/projects/${parent.projectId}/history`);
  revalidatePath(`/projects/${parent.projectId}`);
  revalidatePath("/dashboard");
  await audit({
    kind: "bom.revision.branched",
    refType: "bom",
    refId: parent.bomId,
    summary: `Rev ${letter} branched from Rev ${parent.letter}`,
    payload: { parentRevisionId: parent.id, newRevisionId: newId, letter, projectId: parent.projectId },
  });
  return newId;
}

const DiscardInput = z.object({ revisionId: z.string() });

export async function discardDraft(input: z.infer<typeof DiscardInput>) {
  const { revisionId } = DiscardInput.parse(input);
  const rev = await loadRevision(revisionId);
  if (rev.status !== "draft") throw new Error("REVISION_NOT_DRAFT");

  const session = await requireSession();
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
