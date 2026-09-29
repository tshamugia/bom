import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { roleOf, type UserRole } from "@/lib/roles";

export type { UserRole };

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  if ((session.user as { disabled?: boolean }).disabled) throw new Error("USER_DISABLED");
  return session;
}

export async function requireRole(...roles: UserRole[]) {
  const session = await requireSession();
  const role = roleOf(session.user);
  if (!roles.includes(role)) throw new Error("FORBIDDEN");
  return { ...session, user: { ...session.user, role } };
}
