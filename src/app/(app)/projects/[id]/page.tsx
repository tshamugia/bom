import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, listOwnerCandidates } from "@/server/queries/projects";
import { PageHead } from "@/components/master/page-head";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { ProjectEditForm } from "@/components/projects/project-edit-form";

export default async function ProjectEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, owners] = await Promise.all([getProject(id), listOwnerCandidates()]);
  if (!project) notFound();

  return (
    <>
      <PageHead
        title={project.name}
        subtitle={`${project.code} · edit project metadata`}
        actions={
          <>
            <Link href={`/builder/${project.id}`}>
              <Button variant="outline"><Icon.Box size={14} className="mr-1.5" /> Open builder</Button>
            </Link>
            <Link href={`/projects/${project.id}/history`}>
              <Button variant="outline"><Icon.History size={14} className="mr-1.5" /> History</Button>
            </Link>
          </>
        }
      />
      <ProjectEditForm
        project={{
          id: project.id,
          code: project.code,
          name: project.name,
          quantity: project.quantity,
          targetDate: project.targetDate,
          ownerId: project.ownerId,
        }}
        owners={owners}
      />
    </>
  );
}
