"use server";

import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { bomLines, bomRevisions, bomSections, items, projects, vendors } from "@/db/schema";
import { getCurrentOrgId, requireSession } from "../org";
import { audit } from "../audit";
import { isRevisionImmutable } from "../lib/revision-status";

async function loadRevisionInOrg(revisionId: string) {
  const orgId = await getCurrentOrgId();
  const [row] = await db
    .select({
      id: bomRevisions.id,
      status: bomRevisions.status,
      letter: bomRevisions.letter,
      projectId: bomRevisions.projectId,
    })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomRevisions.id, revisionId), eq(projects.organizationId, orgId)))
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
  const rev = await loadRevisionInOrg(revisionId);
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

  revalidatePath(`/builder/${rev.projectId}`);
  revalidatePath(`/projects/${rev.projectId}/history`);
  revalidatePath("/dashboard");
  await audit({
    kind: "bom.revision.committed",
    refType: "project",
    refId: rev.projectId,
    summary: `Rev ${rev.letter} committed`,
    payload: { revisionId, letter: rev.letter, commitMessage: commitMessage ?? null },
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
  const parent = await loadRevisionInOrg(parentRevisionId);
  if (!isRevisionImmutable(parent.status) || parent.status === "draft") {
    throw new Error("PARENT_NOT_COMMITTED");
  }

  const [{ draftCount }] = await db
    .select({ draftCount: count() })
    .from(bomRevisions)
    .where(and(eq(bomRevisions.projectId, parent.projectId), eq(bomRevisions.status, "draft")));
  if (draftCount > 0) throw new Error("DRAFT_ALREADY_EXISTS");

  const session = await requireSession();
  const existing = await db
    .select({ letter: bomRevisions.letter })
    .from(bomRevisions)
    .where(eq(bomRevisions.projectId, parent.projectId));
  const letter = nextLetter(existing.map(e => e.letter));

  const newId = await db.transaction(async tx => {
    const [child] = await tx.insert(bomRevisions).values({
      projectId: parent.projectId,
      parentRevisionId: parent.id,
      letter,
      status: "draft",
      ownerId: session.user.id,
    }).returning();

    const parentSections = await tx
      .select()
      .from(bomSections)
      .where(eq(bomSections.revisionId, parent.id));

    const sectionIdMap = new Map<string, string>();
    for (const s of parentSections) {
      const [created] = await tx.insert(bomSections).values({
        revisionId: child.id,
        sectionKey: s.sectionKey,
        name: s.name,
        position: s.position,
      }).returning();
      sectionIdMap.set(s.id, created.id);
    }

    const parentLines = await tx
      .select({
        sectionId: bomLines.sectionId,
        itemId: bomLines.itemId,
        qty: bomLines.qty,
        position: bomLines.position,
      })
      .from(bomLines)
      .where(eq(bomLines.revisionId, parent.id));

    for (const l of parentLines) {
      const [item] = await tx
        .select({
          unitPrice: items.unitPrice, sku: items.sku, description: items.description,
          manufacturer: items.manufacturer, unit: items.unit, vendorId: items.vendorId,
        })
        .from(items)
        .where(eq(items.id, l.itemId))
        .limit(1);
      if (!item) continue;
      const [vendor] = item.vendorId
        ? await tx.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, item.vendorId)).limit(1)
        : [];
      await tx.insert(bomLines).values({
        revisionId: child.id,
        sectionId: l.sectionId ? sectionIdMap.get(l.sectionId) ?? null : null,
        itemId: l.itemId,
        qty: l.qty,
        unitPriceSnapshot: item.unitPrice,
        skuSnapshot: item.sku,
        descriptionSnapshot: item.description,
        manufacturerSnapshot: item.manufacturer,
        unitSnapshot: item.unit,
        vendorNameSnapshot: vendor?.name ?? null,
        position: l.position,
      });
    }
    return child.id;
  });

  revalidatePath(`/builder/${parent.projectId}`);
  revalidatePath(`/projects/${parent.projectId}/history`);
  revalidatePath("/dashboard");
  await audit({
    kind: "bom.revision.branched",
    refType: "project",
    refId: parent.projectId,
    summary: `Rev ${letter} branched from Rev ${parent.letter}`,
    payload: { parentRevisionId: parent.id, newRevisionId: newId, letter },
  });
  return newId;
}
