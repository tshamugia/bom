import { beforeEach, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));

import { auth } from "@/lib/auth";
import { requireSession, requireRole } from "@/server/auth-context";

beforeEach(() => {
  vi.mocked(auth.api.getSession).mockReset();
});

function mockUser(role: "owner" | "admin" | "member", disabled = false) {
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

test("requireRole owner: allows owner, denies admin/member", async () => {
  for (const r of ["owner", "admin", "member"] as const) {
    mockUser(r);
    if (r === "owner") {
      await expect(requireRole("owner")).resolves.toBeTruthy();
    } else {
      await expect(requireRole("owner")).rejects.toThrow(/FORBIDDEN/);
    }
  }
});

test("requireRole(owner, admin): allows both, denies member", async () => {
  mockUser("owner"); await expect(requireRole("owner", "admin")).resolves.toBeTruthy();
  mockUser("admin"); await expect(requireRole("owner", "admin")).resolves.toBeTruthy();
  mockUser("member"); await expect(requireRole("owner", "admin")).rejects.toThrow(/FORBIDDEN/);
});

test("requireRole denies unauthenticated", async () => {
  vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
  await expect(requireRole("member")).rejects.toThrow(/UNAUTHENTICATED/);
});
