import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { listProjects, getProject, getActiveRevision, getLines } from "./projects";
import { getForProject } from "./approvals";

export type PreviewProject = { id: string; code: string; name: string };

export async function loadPreview(projectId?: string) {
  const projects = await listProjects();
  if (projects.length === 0) return { kind: "no-projects" as const };

  const target = projectId ? projects.find(p => p.id === projectId) : projects[0];
  if (!target) return { kind: "not-found" as const };

  const project = await getProject(target.id);
  if (!project) return { kind: "not-found" as const };

  const rev = await getActiveRevision(project.id);
  const switcher: PreviewProject[] = projects.map(p => ({ id: p.id, code: p.code, name: p.name }));

  let ownerName = "—";
  if (project.ownerId) {
    const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, project.ownerId)).limit(1);
    ownerName = owner?.name ?? "—";
  }

  if (!rev) return { kind: "no-revision" as const, project, projects: switcher, ownerName };

  const [lines, workflow] = await Promise.all([getLines(rev.id), getForProject(project.id)]);

  return {
    kind: "ok" as const,
    project,
    projects: switcher,
    rev,
    lines,
    workflow,
    ownerName,
  };
}
