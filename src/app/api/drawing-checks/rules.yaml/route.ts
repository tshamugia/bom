import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth-context";
import { loadDrawingCheckConfig } from "@/server/lib/drawing-check-config";
import { exportRulesYaml } from "@/lib/drawing-check-yaml";
import { isAdmin } from "@/lib/roles";

/**
 * Settings → DXF check settings → Export: the settings in the skill's
 * rules.yaml format, so the drawing-standard-checker skill doesn't fall
 * behind Revline. Admins only; built on request, never stored.
 */
export async function GET() {
  let admin = false;
  try {
    admin = isAdmin((await requireSession()).user);
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!admin) return new NextResponse("Forbidden", { status: 403 });

  const config = await loadDrawingCheckConfig();
  const yaml = exportRulesYaml({ version: config.version, exportedAt: new Date(), overrides: config.params, rules: config.rules });
  return new NextResponse(yaml, {
    status: 200,
    headers: {
      "content-type": "application/yaml; charset=utf-8",
      "content-disposition": 'attachment; filename="rules.yaml"',
      "cache-control": "no-store",
    },
  });
}
