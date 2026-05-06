import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type UserRole = "owner" | "admin" | "member";

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  if ((session.user as { disabled?: boolean }).disabled) throw new Error("USER_DISABLED");
  return session;
}

export async function requireRole(...roles: UserRole[]) {
  const session = await requireSession();
  const role = (session.user as { role?: UserRole }).role ?? "member";
  if (!roles.includes(role)) throw new Error("FORBIDDEN");
  return { ...session, user: { ...session.user, role } };
}
