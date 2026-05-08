import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { getProject, getActiveRevision, getLines } from "./projects";
import { getBom, listBomsByProject, listProjectsForPicker } from "./boms";
import { getForProject } from "./approvals";

export type PreviewProjectOption = { id: string; code: string; name: string };
export type PreviewBomOption = { id: string; name: string };

export async function loadPreviewForBom(projectId: string, bomId: string) {
  const project = await getProject(projectId);
  if (!project) return { kind: "not-found" as const };

  const bom = await getBom(bomId);
  if (!bom || bom.projectId !== project.id) return { kind: "not-found" as const };

  const rev = await getActiveRevision(bom.id);

  const [projectsList, bomsList] = await Promise.all([
    listProjectsForPicker(),
    listBomsByProject(project.id),
  ]);

  let ownerName = "—";
  if (project.ownerId) {
    const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, project.ownerId)).limit(1);
    ownerName = owner?.name ?? "—";
  }

  const projectOptions: PreviewProjectOption[] = projectsList.map(p => ({ id: p.id, code: p.code, name: p.name }));
  const bomOptions: PreviewBomOption[] = bomsList.map(b => ({ id: b.id, name: b.name }));

  if (!rev) {
    return { kind: "no-revision" as const, project, bom, projects: projectOptions, boms: bomOptions, ownerName };
  }

  const [lines, workflow] = await Promise.all([getLines(rev.id), getForProject(project.id)]);

  return {
    kind: "ok" as const,
    project,
    bom,
    projects: projectOptions,
    boms: bomOptions,
    rev,
    lines,
    workflow,
    ownerName,
  };
}
