import "server-only";
import { getCurrentOrgId } from "@/server/org";
import { getStagingBuffer, stagingKey } from "@/lib/s3";
import { parseImportBuffer } from "@/server/lib/import-parser";
import { validateRows } from "@/server/lib/import-validator";
import { loadValidatorContext } from "@/server/lib/import-validator-context";
import type { DryRunResult } from "@/lib/schemas/import";

export type GetDryRunResult =
  | { ok: true; result: DryRunResult }
  | { ok: false; error: "expired" | "header_mismatch" | "unreadable" };

export async function getDryRun(importId: string): Promise<GetDryRunResult> {
  const orgId = await getCurrentOrgId();
  const key = stagingKey(orgId, importId);
  const buf = await getStagingBuffer(key);
  if (!buf) return { ok: false, error: "expired" };

  const parsed = await parseImportBuffer(buf);
  if (!parsed.ok && parsed.error === "header_mismatch") return { ok: false, error: "header_mismatch" };
  if (!parsed.ok) return { ok: false, error: "unreadable" };

  const ctx = await loadValidatorContext(orgId);
  const result = validateRows(
    { importId, fileName: `${importId}.xlsx`, rows: parsed.rows, parserErrors: parsed.rowErrors },
    ctx,
  );
  return { ok: true, result };
}
