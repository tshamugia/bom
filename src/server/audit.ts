import "server-only";
import { headers } from "next/headers";
import { requireSession } from "./auth-context";
import { clientInfo, writeAudit, type AuditRow } from "./lib/audit-write";

type AuditInput = Omit<AuditRow, "actorId" | "ip" | "userAgent">;

export async function audit(input: AuditInput): Promise<void> {
  let actorId: string | null = null;
  try {
    const session = await requireSession();
    actorId = session.user.id;
  } catch {
    // System actions can omit an actor.
  }
  let info: ReturnType<typeof clientInfo> = { ip: null, userAgent: null };
  try {
    info = clientInfo(await headers());
  } catch {
    // Outside a request (cron, scripts) there are no headers.
  }
  await writeAudit({ ...input, actorId, ...info });
}
