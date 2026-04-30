import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { memberships } from "@/db/schema";

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function getCurrentOrgId(): Promise<string> {
  const session = await requireSession();
  const [m] = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(eq(memberships.userId, session.user.id))
    .limit(1);
  if (!m) throw new Error("NO_MEMBERSHIP");
  return m.organizationId;
}
