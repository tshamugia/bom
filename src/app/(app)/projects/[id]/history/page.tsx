import { notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { boms, bomRevisions, projects, user } from "@/db/schema";
import { requireSession } from "@/server/auth-context";
import { HistoryTable, type HistoryRow } from "@/components/revisions/history-table";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSession();

  const [project] = await db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!project) notFound();

  const bomRows = await db
    .select({ id: boms.id, name: boms.name })
    .from(boms)
    .where(eq(boms.projectId, id))
    .orderBy(desc(boms.updatedAt));

  const allRevisions = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      committedByName: user.name,
      committedAt: bomRevisions.committedAt,
      commitMessage: bomRevisions.commitMessage,
      parentRevisionId: bomRevisions.parentRevisionId,
      bomId: bomRevisions.bomId,
    })
    .from(bomRevisions)
    .leftJoin(user, eq(user.id, bomRevisions.committedById))
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .where(eq(boms.projectId, id))
    .orderBy(desc(bomRevisions.createdAt));

  const groupedByBom = new Map<string, HistoryRow[]>();
  for (const r of allRevisions) {
    const list = groupedByBom.get(r.bomId) ?? [];
    list.push({
      id: r.id,
      letter: r.letter,
      status: r.status,
      committedByName: r.committedByName ?? null,
      committedAt: r.committedAt ?? null,
      commitMessage: r.commitMessage ?? null,
      parentRevisionId: r.parentRevisionId ?? null,
    });
    groupedByBom.set(r.bomId, list);
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold tracking-tight">{project.name} — history</h1>
        <p className="text-[13px] text-[var(--color-text-3)]">All revisions across the BOMs of {project.code}.</p>
      </div>

      {bomRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-10 text-center text-[13px] text-[var(--color-text-3)]">
          No BOMs in this project yet.
        </div>
      ) : (
        <div className="space-y-6">
          {bomRows.map(b => {
            const rows = groupedByBom.get(b.id) ?? [];
            return (
              <div key={b.id}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold tracking-tight">{b.name}</h2>
                  <Link href={`/builder/${project.id}/${b.id}`}>
                    <Button variant="ghost" size="sm"><Icon.Box size={14} className="mr-1" /> Open</Button>
                  </Link>
                </div>
                {rows.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-6 text-center text-[12.5px] text-[var(--color-text-3)]">
                    No revisions yet.
                  </div>
                ) : (
                  <HistoryTable projectId={id} bomId={b.id} rows={rows} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
