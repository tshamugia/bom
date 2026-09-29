import { beforeEach, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));

import { auth } from "@/lib/auth";
import { requireSession, requireRole } from "@/server/auth-context";

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockReset();
});

function mockUser(role: string, disabled = false) {
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: "u", name: "U", email: "u@e.com", role, disabled },
    session: { id: "s", userId: "u" },
  } as never);
}

test("requireSession throws UNAUTHENTICATED when no session", async () => {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
  await expect(requireSession()).rejects.toThrow(/UNAUTHENTICATED/);
});

test("requireSession throws USER_DISABLED when account is disabled", async () => {
  mockUser("member", true);
  await expect(requireSession()).rejects.toThrow(/USER_DISABLED/);
});

test("requireRole(admin): allows admin, denies member", async () => {
  mockUser("admin"); await expect(requireRole("admin")).resolves.toBeTruthy();
  mockUser("member"); await expect(requireRole("admin")).rejects.toThrow(/FORBIDDEN/);
});

test("requireRole(admin): an unknown or legacy role is treated as member", async () => {
  mockUser("owner"); await expect(requireRole("admin")).rejects.toThrow(/FORBIDDEN/);
  mockUser("owner"); await expect(requireRole("member")).resolves.toBeTruthy();
});

test("requireRole returns the normalised role", async () => {
  mockUser("admin");
  const s = await requireRole("admin", "member");
  expect(s.user.role).toBe("admin");
});

test("requireRole denies unauthenticated", async () => {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
  await expect(requireRole("member")).rejects.toThrow(/UNAUTHENTICATED/);
});

test("requireRole(editors): allows admin and member, denies viewer", async () => {
  const editors = ["admin", "member"] as const;
  mockUser("admin"); await expect(requireRole(...editors)).resolves.toBeTruthy();
  mockUser("member"); await expect(requireRole(...editors)).resolves.toBeTruthy();
  mockUser("viewer"); await expect(requireRole(...editors)).rejects.toThrow(/FORBIDDEN/);
});

test("requireSession lets a viewer read", async () => {
  mockUser("viewer");
  await expect(requireSession()).resolves.toBeTruthy();
});
