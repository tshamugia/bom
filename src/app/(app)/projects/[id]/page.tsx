import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, listOwnerCandidates } from "@/server/queries/projects";
import { listBomsByProject } from "@/server/queries/boms";
import { PageHead } from "@/components/master/page-head";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { ProjectEditForm } from "@/components/projects/project-edit-form";
import { BomList, type BomRow } from "@/components/projects/bom-list";
import { NewBomDialog } from "@/components/boms/new-bom-dialog";

export default async function ProjectEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, owners, bomList] = await Promise.all([
    getProject(id),
    listOwnerCandidates(),
    listBomsByProject(id),
  ]);
  if (!project) notFound();

  return (
    <>
      <PageHead
        title={project.name}
        subtitle={`${project.code} · BOMs and metadata`}
        actions={
          <>
            <Link href={`/projects/${project.id}/history`}>
              <Button variant="outline"><Icon.History size={14} className="mr-1.5" /> History</Button>
            </Link>
            <NewBomDialog projectId={project.id} />
          </>
        }
      />

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">BOMs</h2>
        <span className="text-[12px] text-[var(--color-text-3)]">{bomList.length} total</span>
      </div>
      <BomList projectId={project.id} rows={bomList as BomRow[]} />

      <div className="mt-8 mb-2">
        <h2 className="text-[15px] font-semibold tracking-tight">Project metadata</h2>
      </div>
      <ProjectEditForm
        project={{
          id: project.id,
          code: project.code,
          name: project.name,
          targetDate: project.targetDate,
          ownerId: project.ownerId,
        }}
        owners={owners}
      />
    </>
  );
}
