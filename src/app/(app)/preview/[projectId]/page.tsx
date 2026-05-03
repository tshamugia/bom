import { notFound } from "next/navigation";
import { getProject, getActiveRevision, getLines, getSections, getLatestProcurementRevision } from "@/server/queries/projects";
import { getForProject } from "@/server/queries/approvals";
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
  const [lines, sections, procurementRev] = await Promise.all([
    getLines(rev.id),
    getSections(rev.id),
    getLatestProcurementRevision(project.id),
  ]);
  const workflow = await getForProject(project.id);

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
      procurementRevision={procurementRev && procurementRev.status === "committed"
        ? { id: procurementRev.id, letter: procurementRev.letter }
        : null}
      lines={lines as never}
      sections={sections}
      steps={workflow ? workflow.steps.map(s => ({ position: s.position, role: s.role, status: s.status, assigneeName: s.assigneeName })) : null}
    />
  );
}
