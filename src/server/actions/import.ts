"use server";

import { createId } from "@paralleldrive/cuid2";
import { putObject, stagingKey } from "@/lib/s3";
import { getCurrentOrgId, requireSession } from "@/server/org";
import { parseImportBuffer } from "@/server/lib/import-parser";
import { validateRows } from "@/server/lib/import-validator";
import { loadValidatorContext } from "@/server/lib/import-validator-context";
import type { PrepareResult } from "@/lib/schemas/import";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function prepareImport(formData: FormData): Promise<PrepareResult> {
  await requireSession();
  const orgId = await getCurrentOrgId();

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "unreadable" };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "too_large" };

  const buf = Buffer.from(await file.arrayBuffer());
  const importId = createId();
  const key = stagingKey(orgId, importId);
  await putObject(key, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  const parsed = await parseImportBuffer(buf);
  if (!parsed.ok && parsed.error === "header_mismatch") {
    return { ok: false, error: "header_mismatch", expected: parsed.expected, found: parsed.found };
  }
  if (!parsed.ok) return { ok: false, error: "unreadable" };

  const ctx = await loadValidatorContext(orgId);
  const result = validateRows(
    { importId, fileName: file.name, rows: parsed.rows, parserErrors: parsed.rowErrors },
    ctx,
  );
  return { ok: true, result };
}
