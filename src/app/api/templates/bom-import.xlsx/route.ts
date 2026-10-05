import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth-context";
import { buildBomImportTemplate } from "@/server/lib/bom-import-template";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const buf = await buildBomImportTemplate();
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Revline_BOM_import_template.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
