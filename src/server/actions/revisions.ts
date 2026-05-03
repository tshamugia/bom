"use server";

import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { bomLines, bomRevisions, projects } from "@/db/schema";
import { getCurrentOrgId, requireSession } from "../org";
import { audit } from "../audit";

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
