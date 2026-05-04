import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, user } from "@/db/schema";
import { getCurrentOrgId } from "../org";

export async function getStats() {
  const orgId = await getCurrentOrgId();
  const [stats] = await db.execute(sql/* sql */`
    SELECT
      (SELECT COUNT(*)::int FROM "bom_revision" r INNER JOIN "project" p ON p.id = r.project_id
       WHERE p.organization_id = ${orgId} AND r.status NOT IN ('locked'))
        AS "activeBoms",
      (SELECT COUNT(*)::int FROM "approval_workflow" w
       INNER JOIN "bom_revision" r ON r.id = w.revision_id
       INNER JOIN "project" p ON p.id = r.project_id
       WHERE p.organization_id = ${orgId} AND w.status = 'pending')
        AS "approvalsPending"
  `).then(r => r as unknown as Array<{ activeBoms: number; approvalsPending: number }>);
  return {
    activeBoms: stats.activeBoms,
    approvalsPending: stats.approvalsPending,
    avgLeadTimeDays: 5.8,
  };
}

export async function getRecentActivity(limit = 8) {
  const orgId = await getCurrentOrgId();
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
    .where(eq(auditLog.organizationId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function getProjectsForDashboard() {
  const { listProjects } = await import("./projects");
  return listProjects();
}
