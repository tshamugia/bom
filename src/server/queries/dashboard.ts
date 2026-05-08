import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, user, vendors } from "@/db/schema";
import { requireSession } from "../auth-context";
import { parseLeadTimeDays } from "../lib/lead-time";

export async function getStats() {
  await requireSession();
  const [stats] = await db.execute(sql/* sql */`
    SELECT
      (SELECT COUNT(*)::int FROM "bom" b
       WHERE b.deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM "bom_revision" r
           WHERE r.bom_id = b.id AND r.status <> 'locked'
         ))
        AS "activeBoms",
      (SELECT COUNT(*)::int FROM "approval_workflow" w
       WHERE w.status = 'pending')
        AS "approvalsPending"
  `).then(r => r as unknown as Array<{ activeBoms: number; approvalsPending: number }>);

  const vendorRows = await db.select({ leadTime: vendors.leadTime }).from(vendors);
  const days = vendorRows.map(v => parseLeadTimeDays(v.leadTime)).filter((n): n is number => n !== null);
  const avgLeadTimeDays = days.length > 0
    ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
    : 0;

  const [deadlineRow] = await db.execute(sql/* sql */`
    SELECT
      COUNT(*) FILTER (
        WHERE p.target_date IS NOT NULL
          AND p.target_date <= (CURRENT_DATE + INTERVAL '14 days')
      )::int AS "upcoming",
      COUNT(*) FILTER (
        WHERE p.target_date IS NOT NULL
          AND p.target_date < CURRENT_DATE
      )::int AS "overdue"
    FROM "project" p
    WHERE p.deleted_at IS NULL
  `).then(r => r as unknown as Array<{ upcoming: number; overdue: number }>);

  return {
    activeBoms: stats.activeBoms,
    approvalsPending: stats.approvalsPending,
    avgLeadTimeDays,
    upcomingDeadlines: deadlineRow?.upcoming ?? 0,
    overdueDeadlines: deadlineRow?.overdue ?? 0,
  };
}

export async function getUpcomingDeadlines(limit = 5) {
  await requireSession();
  return db.execute(sql/* sql */`
    SELECT p.id, p.code, p.name, p.target_date AS "targetDate",
      u.name AS "ownerName"
    FROM "project" p
    LEFT JOIN "user" u ON u.id = p.owner_id
    WHERE p.deleted_at IS NULL
      AND p.target_date IS NOT NULL
    ORDER BY p.target_date ASC
    LIMIT ${limit}
  `).then(r => r as unknown as Array<{
    id: string; code: string; name: string;
    targetDate: string; ownerName: string | null;
  }>);
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
