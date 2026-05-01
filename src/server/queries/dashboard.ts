import "server-only";
import { and, desc, eq, sql, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  projects, bomRevisions, bomLines, items, vendors,
  approvalWorkflows, auditLog, user,
} from "@/db/schema";
import { getCurrentOrgId } from "../org";

export async function getStats() {
  const orgId = await getCurrentOrgId();
  const [stats] = await db.execute(sql/* sql */`
    SELECT
      (SELECT COUNT(*)::int FROM "bom_revision" r INNER JOIN "project" p ON p.id = r.project_id
       WHERE p.organization_id = ${orgId} AND r.status NOT IN ('locked'))
        AS "activeBoms",
      (SELECT COALESCE(SUM(l.qty * l.unit_price_snapshot), 0)::float
       FROM "bom_line" l
       INNER JOIN "bom_revision" r ON r.id = l.revision_id
       INNER JOIN "project" p ON p.id = r.project_id
       WHERE p.organization_id = ${orgId} AND r.status NOT IN ('locked'))
        AS "openValue",
      (SELECT COUNT(*)::int FROM "approval_workflow" w
       INNER JOIN "bom_revision" r ON r.id = w.revision_id
       INNER JOIN "project" p ON p.id = r.project_id
       WHERE p.organization_id = ${orgId} AND w.status = 'pending')
        AS "approvalsPending"
  `).then(r => r as unknown as Array<{ activeBoms: number; openValue: number; approvalsPending: number }>);
  return {
    activeBoms: stats.activeBoms,
    openValue: stats.openValue,
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

export async function getStockAlerts() {
  const orgId = await getCurrentOrgId();
  return db
    .select({
      id: items.id, sku: items.sku, description: items.description,
      stockState: items.stockState, onHand: items.onHand, unit: items.unit,
    })
    .from(items)
    .where(and(eq(items.organizationId, orgId), ne(items.stockState, "in-stock")))
    .orderBy(items.stockState, desc(items.onHand))
    .limit(10);
}

export async function getProjectsForDashboard() {
  const { listProjects } = await import("./projects");
  return listProjects();
}
