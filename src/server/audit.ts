import "server-only";
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { requireSession } from "./auth-context";

type AuditInput = {
  kind: typeof auditLog.$inferInsert["kind"];
  refType?: string;
  refId?: string;
  summary: string;
  payload?: Record<string, unknown>;
};

export async function audit(input: AuditInput): Promise<void> {
  try {
    let actorId: string | null = null;
    try {
      const session = await requireSession();
      actorId = session.user.id;
    } catch {
      // System actions can omit an actor.
    }
    await db.insert(auditLog).values({
      actorId,
      kind: input.kind,
      refType: input.refType,
      refId: input.refId,
      summary: input.summary,
      payload: input.payload,
    });
  } catch (e) {
    console.warn("[audit] insert failed (swallowed):", e);
  }
}
