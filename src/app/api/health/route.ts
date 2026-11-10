import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { env } from "@/lib/env";

/**
 * Public liveness check: the app is up and reaches Postgres. Railway's deploy
 * healthcheck calls it, and the deploy workflow reads `version` to confirm the
 * release is live. No session, no data beyond the build's version and commit.
 */
export async function GET() {
  const body = { version: env.APP_VERSION ?? "dev", revision: env.APP_REVISION ?? null };
  const headers = { "cache-control": "no-store" };
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, ...body }, { headers });
  } catch (e) {
    console.error("[health] database check failed", e);
    return NextResponse.json({ ok: false, ...body }, { status: 503, headers });
  }
}
