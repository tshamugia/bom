import { db } from "@/db/client";
import { auditLog } from "@/db/schema";

// No "server-only" here: `src/lib/auth.ts` imports this for its hooks, and the
// seed scripts import `auth` under plain Node where "server-only" throws.

export type AuditRow = {
  kind: typeof auditLog.$inferInsert["kind"];
  actorId: string | null;
  refType?: string;
  refId?: string;
  summary: string;
  payload?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

/** Where the request came from. Railway puts the client first in X-Forwarded-For. */
export function clientInfo(h: Headers | null | undefined): { ip: string | null; userAgent: string | null } {
  if (!h) return { ip: null, userAgent: null };
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim() || null;
  const userAgent = h.get("user-agent")?.slice(0, 400) || null;
  return { ip, userAgent };
}

/** Audit writes never fail the action they describe. */
export async function writeAudit(row: AuditRow): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: row.actorId,
      kind: row.kind,
      refType: row.refType,
      refId: row.refId,
      summary: row.summary,
      payload: row.payload,
      ip: row.ip ?? null,
      userAgent: row.userAgent ?? null,
    });
  } catch (e) {
    console.warn("[audit] insert failed (swallowed):", e);
  }
}
