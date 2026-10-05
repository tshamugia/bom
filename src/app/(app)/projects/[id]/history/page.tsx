import { notFound } from "next/navigation";
import Link from "next/link";
import { aliasedTable, and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boms, bomRevisions, projects, user } from "@/db/schema";
import { requireSession } from "@/server/auth-context";
import { canEdit } from "@/lib/roles";
import { revisionSentSql } from "@/server/lib/revision-status";
import { listOwnerCandidates } from "@/server/queries/projects";
import { HistoryTable, type HistoryRow } from "@/components/revisions/history-table";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { PageHead } from "@/components/master/page-head";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const readOnly = !canEdit(session.user);

  const [project] = await db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!project) notFound();

  const bomOwner = aliasedTable(user, "bom_owner");
  const revOwner = aliasedTable(user, "rev_owner");
  const statusUser = aliasedTable(user, "status_user");
  const bomRows = await db
    .select({ id: boms.id, name: boms.name, ownerId: boms.ownerId, ownerName: bomOwner.name })
    .from(boms)
    .leftJoin(bomOwner, eq(bomOwner.id, boms.ownerId))
    // Deleted BOMs can't be opened any more; their trail is in the audit log.
    .where(and(eq(boms.projectId, id), isNull(boms.deletedAt)))
    .orderBy(desc(boms.updatedAt));
  // Viewers can't change a BOM, so they can't own one either.
  const owners = readOnly
    ? []
    : (await listOwnerCandidates()).filter(u => u.role !== "viewer").map(u => ({ id: u.id, name: u.name }));

  const allRevisions = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      ownerName: revOwner.name,
      committedByName: user.name,
      committedAt: bomRevisions.committedAt,
      commitMessage: bomRevisions.commitMessage,
      parentRevisionId: bomRevisions.parentRevisionId,
      bomId: bomRevisions.bomId,
      statusChangedByName: statusUser.name,
      sent: revisionSentSql(bomRevisions.id),
    })
    .from(bomRevisions)
    .leftJoin(user, eq(user.id, bomRevisions.committedById))
    .leftJoin(revOwner, eq(revOwner.id, bomRevisions.ownerId))
    .leftJoin(statusUser, eq(statusUser.id, bomRevisions.statusChangedById))
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
      ownerName: r.ownerName ?? null,
      committedByName: r.committedByName ?? null,
      committedAt: r.committedAt ?? null,
      commitMessage: r.commitMessage ?? null,
      parentRevisionId: r.parentRevisionId ?? null,
      statusChangedByName: r.statusChangedByName ?? null,
      sent: r.sent,
    });
    groupedByBom.set(r.bomId, list);
  }

  return (
    <div>
      <PageHead
        back={{ href: `/projects/${project.id}`, label: project.name }}
        title={`${project.name} — history`}
        subtitle={`All revisions across the BOMs of ${project.code}.`}
      />

      {bomRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-10 text-center text-[13px] text-[var(--color-text-3)] max-[701px]:p-6">
          No BOMs in this project yet.
        </div>
      ) : (
        <div className="space-y-6">
          {bomRows.map(b => {
            const rows = groupedByBom.get(b.id) ?? [];
            return (
              <div key={b.id}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="min-w-0 text-[14px] font-semibold tracking-tight [overflow-wrap:anywhere]">{b.name}</h2>
                  <Link href={`/${readOnly ? "preview" : "builder"}/${project.id}/${b.id}`}>
                    <Button variant="ghost" size="sm"><Icon.Box size={14} className="mr-1" /> Open</Button>
                  </Link>
                </div>
                {rows.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-6 text-center text-[12.5px] text-[var(--color-text-3)]">
                    No revisions yet.
                  </div>
                ) : (
                  <HistoryTable
                    projectId={id}
                    bomId={b.id}
                    rows={rows}
                    bomOwner={{ id: b.ownerId, name: b.ownerName }}
                    owners={owners}
                    readOnly={readOnly}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
