import { notFound, redirect } from "next/navigation";
import { getProject } from "@/server/queries/projects";
import { getBomByProjectMostRecent } from "@/server/queries/boms";

export default async function BuilderProjectIndex({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const bom = await getBomByProjectMostRecent(projectId);
  if (bom) redirect(`/builder/${projectId}/${bom.id}`);
  redirect(`/projects/${projectId}`);
}
