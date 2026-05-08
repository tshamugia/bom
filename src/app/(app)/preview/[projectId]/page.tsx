import { notFound, redirect } from "next/navigation";
import { getProject } from "@/server/queries/projects";
import { getBomByProjectMostRecent } from "@/server/queries/boms";

export default async function PreviewProjectIndex({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const bom = await getBomByProjectMostRecent(projectId);
  if (bom) redirect(`/preview/${projectId}/${bom.id}`);
  redirect(`/projects/${projectId}`);
}
