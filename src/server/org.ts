import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { memberships, organizations } from "@/db/schema";

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
  if (m) return m.organizationId;
  return provisionMembership(session.user.id, session.user.name, session.user.email);
}

async function provisionMembership(userId: string, name: string | null | undefined, email: string): Promise<string> {
  const [existing] = await db.select().from(organizations).limit(1);
  if (existing) {
    await db.insert(memberships).values({ userId, organizationId: existing.id, role: "member" }).onConflictDoNothing();
    return existing.id;
  }
  const baseName = name?.trim() || email.split("@")[0] || "Workspace";
  const slugBase = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const slug = `${slugBase}-${userId.slice(-6)}`;
  const [org] = await db
    .insert(organizations)
    .values({ name: `${baseName}'s Workspace`, slug })
    .returning();
  await db.insert(memberships).values({ userId, organizationId: org.id, role: "owner" }).onConflictDoNothing();
  return org.id;
}
