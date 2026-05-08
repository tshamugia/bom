import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { systemSettings, SYSTEM_SETTINGS_ID } from "@/db/schema";
import { requireSession } from "../auth-context";

export type ProcurementSettings = {
  to: string[];
  cc: string[];
  subject: string | null;
  body: string | null;
};

export async function getProcurementSettings(): Promise<ProcurementSettings> {
  await requireSession();
  const [row] = await db
    .select({
      to: systemSettings.procurementTo,
      cc: systemSettings.procurementCc,
      subject: systemSettings.procurementSubject,
      body: systemSettings.procurementBody,
    })
    .from(systemSettings)
    .where(eq(systemSettings.id, SYSTEM_SETTINGS_ID))
    .limit(1);

  return {
    to: row?.to ?? [],
    cc: row?.cc ?? [],
    subject: row?.subject ?? null,
    body: row?.body ?? null,
  };
}
