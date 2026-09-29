import { vi } from "vitest";
import type { UserRole } from "@/lib/roles";
import { ensureUser } from "./db";

export type MockedSessionUser = Awaited<ReturnType<typeof ensureUser>>;

export async function mockSession(role: UserRole = "admin") {
  const u = await ensureUser(role);
  const session = {
    user: { id: u.id, name: u.name, email: u.email, role: u.role, disabled: u.disabled },
    session: { id: "test-session", userId: u.id },
  };
  const { requireSession, requireRole } = await import("@/server/auth-context");
  vi.mocked(requireSession).mockResolvedValue(session as never);
  vi.mocked(requireRole).mockImplementation(async (...roles: UserRole[]) => {
    if (!roles.includes(role)) throw new Error("FORBIDDEN");
    return session as never;
  });
  return { user: u, session };
}
