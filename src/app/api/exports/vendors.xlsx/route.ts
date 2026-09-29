import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { requireSession } from "@/server/auth-context";
import { audit } from "@/server/audit";
import { buildVendorWorkbook } from "@/lib/excel";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const rows = await db
    .select({
      name: vendors.name,
      code: vendors.code,
      country: vendors.country,
      leadTime: vendors.leadTime,
      rating: vendors.rating,
      status: vendors.status,
      itemsCount: vendors.itemsCount,
    })
    .from(vendors)
    .orderBy(vendors.name);

  const buf = await buildVendorWorkbook(rows);
  const fileName = `Vendors_${new Date().toISOString().slice(0, 10)}.xlsx`;

  await audit({
    kind: "vendors.exported",
    refType: "vendors",
    summary: `${fileName} exported (${rows.length} vendors)`,
    payload: { vendorsCount: rows.length, byteSize: buf.length },
  });

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
