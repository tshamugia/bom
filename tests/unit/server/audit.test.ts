import { beforeEach, expect, test, vi } from "vitest";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { auditLog, user } from "@/db/schema";
import { audit } from "@/server/audit";

vi.mock("@/server/org", () => ({ getCurrentOrgId: vi.fn(), requireSession: vi.fn() }));
import { getCurrentOrgId, requireSession } from "@/server/org";

beforeEach(async () => { await resetDb(); });

test("audit() inserts a row scoped to the current org and actor", async () => {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  const [u] = await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com", emailVerified: true }).returning();
  vi.mocked(requireSession).mockResolvedValue({ user: { id: u.id, name: u.name, email: u.email } } as any);

  await audit({ kind: "vendor.created", refType: "vendor", refId: "v1", summary: "Mouser added" });

  const rows = await db.select().from(auditLog);
  expect(rows).toHaveLength(1);
  expect(rows[0].organizationId).toBe(org.id);
  expect(rows[0].actorId).toBe(u.id);
  expect(rows[0].kind).toBe("vendor.created");
  expect(rows[0].summary).toBe("Mouser added");
});

test("audit() never throws when the underlying insert fails — it logs and swallows", async () => {
  vi.mocked(getCurrentOrgId).mockRejectedValueOnce(new Error("NO_MEMBERSHIP"));
  await expect(audit({ kind: "vendor.created", summary: "x" })).resolves.toBeUndefined();
});
