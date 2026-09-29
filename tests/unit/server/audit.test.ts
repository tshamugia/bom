import { beforeEach, expect, test, vi } from "vitest";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { audit } from "@/server/audit";

vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

test("audit() inserts a row with the current actor", async () => {
  const { user: u } = await mockSession();

  await audit({ kind: "vendor.created", refType: "vendor", refId: "v1", summary: "Mouser added" });

  const rows = await db.select().from(auditLog);
  expect(rows).toHaveLength(1);
  expect(rows[0].actorId).toBe(u.id);
  expect(rows[0].kind).toBe("vendor.created");
  expect(rows[0].summary).toBe("Mouser added");
});

test("audit() never throws when there is no session — it logs anonymously", async () => {
  const { requireSession } = await import("@/server/auth-context");
  vi.mocked(requireSession).mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
  await expect(audit({ kind: "vendor.created", summary: "x" })).resolves.toBeUndefined();
});

test("History → Activity hides security events; the admin Audit log shows them", async () => {
  await mockSession("admin");
  await audit({ kind: "vendor.created", summary: "Mouser added" });
  await audit({ kind: "auth.signin", summary: "someone signed in" });
  await audit({ kind: "user.role.changed", summary: "a: member → admin" });

  const { listActivity, listAuditLog } = await import("@/server/queries/audit");
  expect((await listActivity()).rows.map(r => r.kind)).toEqual(["vendor.created"]);
  expect((await listAuditLog()).rows.map(r => r.kind).sort()).toEqual(["auth.signin", "user.role.changed", "vendor.created"]);
});

test("the Audit log is admin-only", async () => {
  await mockSession("member");
  const { listAuditLog } = await import("@/server/queries/audit");
  await expect(listAuditLog()).rejects.toThrow(/FORBIDDEN/);
});
