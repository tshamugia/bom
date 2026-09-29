import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, notInArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, user } from "@/db/schema";
import { ADMIN_ONLY_KINDS } from "@/lib/audit-kinds";
import { requireRole, requireSession } from "../auth-context";

export type AuditKind = typeof auditLog.$inferSelect["kind"];

export type ActivityFilter = {
  kinds?: AuditKind[];
  actorIds?: string[];
  projectIds?: string[];
  from?: Date;
  to?: Date;
  limit?: number;
  /** Rows to skip — the Audit log pages by offset. */
  offset?: number;
  cursor?: { createdAt: Date; id: string } | null;
};

export type ActivityRow = {
  id: string;
  kind: AuditKind;
  summary: string;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  refType: string | null;
  refId: string | null;
  payload: Record<string, unknown> | null;
};

export type AuditLogRow = ActivityRow & {
  actorEmail: string | null;
  ip: string | null;
  userAgent: string | null;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function buildConds(filter: ActivityFilter, includeAdminOnly: boolean): SQL[] {
  const conds: SQL[] = [];
  if (!includeAdminOnly) conds.push(notInArray(auditLog.kind, [...ADMIN_ONLY_KINDS]));
  if (filter.kinds && filter.kinds.length > 0) conds.push(inArray(auditLog.kind, filter.kinds));
  if (filter.actorIds && filter.actorIds.length > 0) conds.push(inArray(auditLog.actorId, filter.actorIds));
  if (filter.projectIds && filter.projectIds.length > 0) {
    conds.push(eq(auditLog.refType, "project"));
    conds.push(inArray(auditLog.refId, filter.projectIds));
  }
  if (filter.from) conds.push(gte(auditLog.createdAt, filter.from));
  if (filter.to) conds.push(lte(auditLog.createdAt, filter.to));
  if (filter.cursor) {
    conds.push(
      sql`(${auditLog.createdAt}, ${auditLog.id}) < (${filter.cursor.createdAt}, ${filter.cursor.id})`,
    );
  }
  return conds;
}

async function queryAudit(filter: ActivityFilter, includeAdminOnly: boolean) {
  const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const conds = buildConds(filter, includeAdminOnly);

  const rows = await db
    .select({
      id: auditLog.id,
      kind: auditLog.kind,
      summary: auditLog.summary,
      createdAt: auditLog.createdAt,
      actorId: auditLog.actorId,
      actorName: user.name,
      actorEmail: user.email,
      refType: auditLog.refType,
      refId: auditLog.refId,
      payload: auditLog.payload,
      ip: auditLog.ip,
      userAgent: auditLog.userAgent,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1)
    .offset(Math.max(0, filter.offset ?? 0));

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const last = trimmed[trimmed.length - 1];
  const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;
  return { rows: trimmed as AuditLogRow[], nextCursor };
}

/** History → Activity: workspace work, visible to everyone. Security events are left out. */
export async function listActivity(filter: ActivityFilter = {}) {
  await requireSession();
  const { rows, nextCursor } = await queryAudit(filter, false);
  return { rows: rows as ActivityRow[], nextCursor };
}

/** Admin → Audit log: every event, with IP and user agent. */
export async function listAuditLog(filter: ActivityFilter = {}) {
  await requireRole("admin");
  return queryAudit(filter, true);
}

export async function listActivityActors() {
  await requireSession();
  const rows = await db
    .selectDistinctOn([user.id], { id: user.id, name: user.name })
    .from(auditLog)
    .innerJoin(user, eq(user.id, auditLog.actorId))
    .orderBy(asc(user.id));
  return rows
    .filter(r => r.name)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}
