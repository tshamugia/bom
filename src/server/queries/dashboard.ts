import "server-only";
import { and, asc, desc, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, projectMilestones, projects, user, vendors } from "@/db/schema";
import { ADMIN_ONLY_KINDS } from "@/lib/audit-kinds";
import { requireSession } from "../auth-context";
import { parseLeadTimeDays } from "../lib/lead-time";

/** `projectId` narrows BOM and approval counts to one project; lead time stays vendor-wide. */
export async function getStats(opts: { projectId?: string } = {}) {
  await requireSession();
  const projectId = opts.projectId ?? null;
  const [stats] = await db.execute(sql/* sql */`
    SELECT
      (SELECT COUNT(*)::int FROM "bom" b
       WHERE b.deleted_at IS NULL
         AND (${projectId}::text IS NULL OR b.project_id = ${projectId})
         AND EXISTS (
           SELECT 1 FROM "bom_revision" r
           WHERE r.bom_id = b.id AND r.status <> 'locked'
         ))
        AS "activeBoms",
      (SELECT COUNT(*)::int FROM "approval_workflow" w
       JOIN "bom_revision" r ON r.id = w.revision_id
       JOIN "bom" b ON b.id = r.bom_id
       WHERE w.status = 'pending'
         AND (${projectId}::text IS NULL OR b.project_id = ${projectId}))
        AS "approvalsPending"
  `).then(r => r as unknown as Array<{ activeBoms: number; approvalsPending: number }>);

  const vendorRows = await db.select({ leadTime: vendors.leadTime }).from(vendors);
  const days = vendorRows.map(v => parseLeadTimeDays(v.leadTime)).filter((n): n is number => n !== null);
  const avgLeadTimeDays = days.length > 0
    ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
    : 0;

  return {
    activeBoms: stats.activeBoms,
    approvalsPending: stats.approvalsPending,
    avgLeadTimeDays,
  };
}

export type Deadline = {
  key: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  /** "Completion" for the project's own date, otherwise the milestone name. */
  label: string;
  date: string;
};

/**
 * Open milestones and project completion dates, earliest first — overdue ones
 * included, since they still need attention.
 */
export async function listDeadlines(opts: { projectId?: string } = {}): Promise<Deadline[]> {
  await requireSession();
  const live = and(isNull(projects.deletedAt), opts.projectId ? eq(projects.id, opts.projectId) : undefined);
  const [targets, milestones] = await Promise.all([
    db
      .select({ projectId: projects.id, projectCode: projects.code, projectName: projects.name, date: projects.targetDate })
      .from(projects)
      .where(and(live, sql`${projects.targetDate} IS NOT NULL`)),
    db
      .select({
        id: projectMilestones.id,
        projectId: projects.id,
        projectCode: projects.code,
        projectName: projects.name,
        label: projectMilestones.name,
        date: projectMilestones.dueDate,
      })
      .from(projectMilestones)
      .innerJoin(projects, eq(projects.id, projectMilestones.projectId))
      .where(and(live, isNull(projectMilestones.doneAt)))
      .orderBy(asc(projectMilestones.dueDate)),
  ]);
  return [
    ...targets.map(t => ({ ...t, key: `target:${t.projectId}`, label: "Completion", date: t.date! })),
    ...milestones.map(({ id, ...m }) => ({ ...m, key: `milestone:${id}` })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.projectCode.localeCompare(b.projectCode));
}

export async function getRecentActivity(limit = 8, projectId?: string) {
  await requireSession();
  return db
    .select({
      id: auditLog.id,
      kind: auditLog.kind,
      summary: auditLog.summary,
      createdAt: auditLog.createdAt,
      actorName: user.name,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(and(
      // Sign-ins and user/settings changes belong on the admin Audit log only.
      notInArray(auditLog.kind, [...ADMIN_ONLY_KINDS]),
      projectId
        ? or(
            and(eq(auditLog.refType, "project"), eq(auditLog.refId, projectId)),
            sql`${auditLog.payload}->>'projectId' = ${projectId}`,
          )
        : undefined,
    ))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function getProjectsForDashboard() {
  const { listProjects } = await import("./projects");
  return listProjects();
}
