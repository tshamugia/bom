"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { myWorkSeen } from "@/db/schema";
import { requireSession } from "../auth-context";

/**
 * Marks the user's updates as seen when they open My work, so the bell drops
 * them. A personal read marker like a receipt, so viewers may set it too and
 * it isn't audited.
 */
export async function markMyWorkSeen(): Promise<{ ok: true }> {
  const session = await requireSession();
  const now = new Date();
  await db
    .insert(myWorkSeen)
    .values({ userId: session.user.id, seenAt: now })
    .onConflictDoUpdate({ target: myWorkSeen.userId, set: { seenAt: now } });
  // Re-render the layout so the bell drops the updates just seen.
  refresh();
  return { ok: true };
}
