import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bomRevisions, projects, user } from "@/db/schema";
import { requireSession } from "@/server/auth-context";
import { HistoryTable, type HistoryRow } from "@/components/revisions/history-table";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSession();

  const [project] = await db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!project) notFound();

  const rows = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      committedByName: user.name,
      committedAt: bomRevisions.committedAt,
      commitMessage: bomRevisions.commitMessage,
      parentRevisionId: bomRevisions.parentRevisionId,
    })
    .from(bomRevisions)
    .leftJoin(user, eq(user.id, bomRevisions.committedById))
    .where(eq(bomRevisions.projectId, id))
    .orderBy(desc(bomRevisions.createdAt));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold tracking-tight">{project.name} — history</h1>
        <p className="text-[13px] text-[var(--color-text-3)]">All revisions for {project.code}.</p>
      </div>
      <HistoryTable projectId={id} rows={rows as HistoryRow[]} />
    </div>
  );
}
