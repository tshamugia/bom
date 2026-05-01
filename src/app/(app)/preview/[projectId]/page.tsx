import { notFound } from "next/navigation";
import { getProject, getActiveRevision, getLines } from "@/server/queries/projects";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PreviewShell } from "@/components/preview/preview-shell";

export default async function PreviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const project = await getProject(projectId);
  if (!project) notFound();
  const rev = await getActiveRevision(projectId);
  if (!rev) notFound();
  const lines = await getLines(rev.id);

  let ownerName = "—";
  if (project.ownerId) {
    const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, project.ownerId)).limit(1);
    ownerName = owner?.name ?? "—";
  }

  return (
    <PreviewShell
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      projectOwner={ownerName}
      projectTarget={project.targetDate ?? "—"}
      projectQuantity={project.quantity}
      revisionId={rev.id}
      revisionLetter={rev.letter}
      lines={lines as any}
    />
  );
}
