import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { items, vendors, categories, projects, bomRevisions, user } from "@/db/schema";
import { addLine } from "@/server/actions/bom-lines";
import { commitRevision } from "@/server/actions/revisions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/org", () => ({ getCurrentOrgId: vi.fn(), requireSession: vi.fn() }));
import { getCurrentOrgId, requireSession } from "@/server/org";

beforeEach(async () => { await resetDb(); });

async function setup() {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1", name: "Tester" } } as never);

  await db.insert(user).values({ id: "u1", name: "Tester", email: `u1-${org.id}@test.local` });

  const [v] = await db.insert(vendors).values({ name: "V", code: "V", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id }).returning();
  const [c] = await db.insert(categories).values({ name: "C", organizationId: org.id }).returning();
  const [it] = await db.insert(items).values({ sku: "S", description: "d", manufacturer: "m", unit: "pcs", unitPrice: "1.000", onHand: 10, stockState: "in-stock", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id }).returning();
  const [p] = await db.insert(projects).values({ organizationId: org.id, code: "P1", name: "P1", status: "draft" }).returning();
  const [r] = await db.insert(bomRevisions).values({ projectId: p.id, letter: "A", status: "draft", ownerId: "u1" }).returning();
  return { orgId: org.id, projectId: p.id, revisionId: r.id, it };
}

test("commitRevision flips status to committed and stamps author + timestamp + message", async () => {
  const { revisionId, it } = await setup();
  await addLine({ revisionId, itemId: it.id, qty: 1 });
  await commitRevision({ revisionId, commitMessage: "Initial release" });
  const [row] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, revisionId));
  expect(row.status).toBe("committed");
  expect(row.committedById).toBe("u1");
  expect(row.committedAt).toBeInstanceOf(Date);
  expect(row.commitMessage).toBe("Initial release");
});

test("commitRevision rejects empty BOM", async () => {
  const { revisionId } = await setup();
  await expect(commitRevision({ revisionId })).rejects.toThrow(/EMPTY_REVISION/);
});

test("commitRevision rejects non-draft revisions", async () => {
  const { revisionId, it } = await setup();
  await addLine({ revisionId, itemId: it.id, qty: 1 });
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, revisionId));
  await expect(commitRevision({ revisionId })).rejects.toThrow(/NOT_DRAFT/);
});
