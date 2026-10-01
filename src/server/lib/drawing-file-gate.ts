import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { systemSettings, SYSTEM_SETTINGS_ID } from "@/db/schema";
import { parseDrawingFileGate, type DrawingFileGate } from "@/lib/drawing-files";

/** From which status PDFs can be uploaded and sent. No session check — callers have done it. */
export async function loadDrawingFileGate(): Promise<DrawingFileGate> {
  const [row] = await db
    .select({ gate: systemSettings.drawingFileGate })
    .from(systemSettings)
    .where(eq(systemSettings.id, SYSTEM_SETTINGS_ID))
    .limit(1);
  return parseDrawingFileGate(row?.gate);
}
