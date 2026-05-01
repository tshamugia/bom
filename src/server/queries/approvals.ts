import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalWorkflows, approvalSteps, bomRevisions, projects, user } from "@/db/schema";
import { getCurrentOrgId, requireSession } from "../org";

type Row = {
  workflowId: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  currentStepIndex: number;
  projectId: string;
  projectCode: string;
  projectName: string;
  ownerName: string | null;
  lineCount: number;
  total: number;
  age: string;
  activeStepRole: string | null;
};

async function baseList(filter: { status?: "pending" | "approved" | "rejected"; assigneeUserId?: string }) {
  const orgId = await getCurrentOrgId();
  const rows = await db.execute(sql/* sql */`
    SELECT
      w.id                   AS "workflowId",
      w.status               AS "status",
      w.current_step_index   AS "currentStepIndex",
      w.requested_at         AS "requestedAt",
      p.id                   AS "projectId",
      p.code                 AS "projectCode",
      p.name                 AS "projectName",
      u.name                 AS "ownerName",
      (SELECT COUNT(*) FROM "bom_line" l WHERE l.revision_id = w.revision_id)::int AS "lineCount",
      (SELECT COALESCE(SUM(l.qty * l.unit_price_snapshot), 0) FROM "bom_line" l WHERE l.revision_id = w.revision_id)::float AS "total",
      (SELECT s.role FROM "approval_step" s WHERE s.workflow_id = w.id AND s.position = w.current_step_index LIMIT 1) AS "activeStepRole",
      (SELECT s.assignee_id FROM "approval_step" s WHERE s.workflow_id = w.id AND s.position = w.current_step_index LIMIT 1) AS "activeAssigneeId"
    FROM "approval_workflow" w
    INNER JOIN "bom_revision" r ON r.id = w.revision_id
    INNER JOIN "project" p ON p.id = r.project_id
    LEFT JOIN "user" u ON u.id = p.owner_id
    WHERE p.organization_id = ${orgId}
    ${filter.status ? sql`AND w.status = ${filter.status}` : sql``}
    ${filter.assigneeUserId
      ? sql`AND EXISTS (SELECT 1 FROM "approval_step" s2 WHERE s2.workflow_id = w.id AND s2.position = w.current_step_index AND (s2.assignee_id = ${filter.assigneeUserId} OR s2.assignee_id IS NULL))`
      : sql``}
    ORDER BY w.requested_at DESC
  `);

  return (rows as unknown as Array<Row & { requestedAt: Date; activeAssigneeId: string | null }>).map(r => ({
    ...r,
    age: relativeAge(new Date(r.requestedAt)),
  }));
}

function relativeAge(d: Date) {
  const ms = Date.now() - d.getTime();
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(ms / 60_000)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export async function listPendingForUser() {
  const session = await requireSession();
  return baseList({ status: "pending", assigneeUserId: session.user.id });
}
export async function listAllPending() {
  return baseList({ status: "pending" });
}
export async function listApproved() {
  return baseList({ status: "approved" });
}
export async function listRejected() {
  return baseList({ status: "rejected" });
}

export async function getForProject(projectId: string) {
  const orgId = await getCurrentOrgId();
  const [w] = await db
    .select({
      id: approvalWorkflows.id,
      status: approvalWorkflows.status,
      currentStepIndex: approvalWorkflows.currentStepIndex,
      revisionId: approvalWorkflows.revisionId,
    })
    .from(approvalWorkflows)
    .innerJoin(bomRevisions, eq(bomRevisions.id, approvalWorkflows.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId), sql`${approvalWorkflows.status} <> 'cancelled'`))
    .orderBy(desc(approvalWorkflows.requestedAt))
    .limit(1);
  if (!w) return null;
  const steps = await db
    .select({
      id: approvalSteps.id, position: approvalSteps.position, role: approvalSteps.role,
      status: approvalSteps.status, decidedAt: approvalSteps.decidedAt,
      assigneeName: user.name, assigneeId: approvalSteps.assigneeId,
    })
    .from(approvalSteps)
    .leftJoin(user, eq(user.id, approvalSteps.assigneeId))
    .where(eq(approvalSteps.workflowId, w.id))
    .orderBy(asc(approvalSteps.position));
  return { ...w, steps };
}
