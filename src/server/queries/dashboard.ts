import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, user } from "@/db/schema";
import { requireSession } from "../auth-context";

export async function getStats() {
  await requireSession();
  const [stats] = await db.execute(sql/* sql */`
    SELECT
      (SELECT COUNT(*)::int FROM "bom_revision" r
       WHERE r.status NOT IN ('locked'))
        AS "activeBoms",
      (SELECT COUNT(*)::int FROM "approval_workflow" w
       WHERE w.status = 'pending')
        AS "approvalsPending"
  `).then(r => r as unknown as Array<{ activeBoms: number; approvalsPending: number }>);
  return {
    activeBoms: stats.activeBoms,
    approvalsPending: stats.approvalsPending,
    avgLeadTimeDays: 5.8,
  };
}

export async function getRecentActivity(limit = 8) {
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
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function getProjectsForDashboard() {
  const { listProjects } = await import("./projects");
  return listProjects();
}
