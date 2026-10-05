import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUser, resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { items, vendors, categories, projects, boms, bomRevisions, auditLog, user } from "@/db/schema";
import { addLine } from "@/server/actions/bom-lines";
import { commitRevision, branchRevision, discardDraft } from "@/server/actions/revisions";
import { bomLines as bomLinesT, bomSections as bomSectionsT } from "@/db/schema";
import { createSection } from "@/server/actions/bom-sections";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

async function setup() {
  const { user: u } = await mockSession();

  const [v] = await db.insert(vendors).values({ name: "V", code: "V", country: "US", leadTime: "3d", rating: 4, status: "approved" }).returning();
  const [c] = await db.insert(categories).values({ name: "C" }).returning();
  const [it] = await db.insert(items).values({ sku: "S", description: "d", manufacturer: "m", unit: "pcs", vendorId: v.id, categoryId: c.id, subcategoryId: null }).returning();
  const [p] = await db.insert(projects).values({ code: "P1", name: "P1" }).returning();
  const [b] = await db.insert(boms).values({ projectId: p.id, name: "Main BOM" }).returning();
  const [r] = await db.insert(bomRevisions).values({ bomId: b.id, letter: "A", status: "draft", ownerId: u.id }).returning();
  return { projectId: p.id, bomId: b.id, revisionId: r.id, it, userId: u.id };
}

test("commitRevision flips status to committed and stamps author + timestamp + message", async () => {
  const { revisionId, it, userId } = await setup();
  await addLine({ revisionId, itemId: it.id, qty: 1 });
  await commitRevision({ revisionId, commitMessage: "Initial release" });
  const [row] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, revisionId));
  expect(row.status).toBe("committed");
  expect(row.committedById).toBe(userId);
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

test("branchRevision creates next-letter draft and copies sections + lines", async () => {
  const { revisionId, it, userId } = await setup();
  const sec = await createSection({ revisionId, name: "Power" });
  await addLine({ revisionId, itemId: it.id, qty: 2, sectionId: sec.id });
  await commitRevision({ revisionId });

  const newId = await branchRevision({ parentRevisionId: revisionId });
  const [child] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, newId));
  expect(child.letter).toBe("B");
  expect(child.status).toBe("draft");
  expect(child.parentRevisionId).toBe(revisionId);
  expect(child.ownerId).toBe(userId);

  const childSections = await db.select().from(bomSectionsT).where(eq(bomSectionsT.revisionId, newId));
  expect(childSections).toHaveLength(1);
  expect(childSections[0].sectionKey).toBe(sec.sectionKey);
  expect(childSections[0].id).not.toBe(sec.id);

  const childLines = await db.select().from(bomLinesT).where(eq(bomLinesT.revisionId, newId));
  expect(childLines).toHaveLength(1);
  expect(childLines[0].itemId).toBe(it.id);
  expect(childLines[0].qty).toBe(2);
  expect(childLines[0].skuSnapshot).toBe("S");
  expect(childLines[0].sectionId).toBe(childSections[0].id);
});

test("branchRevision rejects when parent is still draft", async () => {
  const { revisionId } = await setup();
  await expect(branchRevision({ parentRevisionId: revisionId })).rejects.toThrow(/PARENT_NOT_COMMITTED/);
});

test("branchRevision rejects when project already has a draft", async () => {
  const { revisionId, it } = await setup();
  await addLine({ revisionId, itemId: it.id, qty: 1 });
  await commitRevision({ revisionId });
  await branchRevision({ parentRevisionId: revisionId });
  await expect(branchRevision({ parentRevisionId: revisionId })).rejects.toThrow(/DRAFT_ALREADY_EXISTS/);
});

async function committedBom(bomOwnerId: string) {
  const ctx = await setup();
  await db.update(boms).set({ ownerId: bomOwnerId }).where(eq(boms.id, ctx.bomId));
  await db.update(bomRevisions).set({ ownerId: bomOwnerId }).where(eq(bomRevisions.id, ctx.revisionId));
  await addLine({ revisionId: ctx.revisionId, itemId: ctx.it.id, qty: 1 });
  await commitRevision({ revisionId: ctx.revisionId });
  return ctx;
}

test("branchRevision keeps the BOM's owner when someone else starts the revision", async () => {
  const owner = await ensureUser("member");
  const { revisionId, bomId } = await committedBom(owner.id);

  const newId = await branchRevision({ parentRevisionId: revisionId });
  const [child] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, newId));
  const [bom] = await db.select().from(boms).where(eq(boms.id, bomId));
  expect(child.ownerId).toBe(owner.id);
  expect(bom.ownerId).toBe(owner.id);
});

test("branchRevision hands the BOM to a new owner together with the new revision", async () => {
  const owner = await ensureUser("member");
  const next = await ensureUser("member");
  const { revisionId, bomId } = await committedBom(owner.id);

  const newId = await branchRevision({ parentRevisionId: revisionId, ownerId: next.id });
  const [child] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, newId));
  const [parent] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, revisionId));
  const [bom] = await db.select().from(boms).where(eq(boms.id, bomId));
  expect(child.ownerId).toBe(next.id);
  expect(bom.ownerId).toBe(next.id);
  expect(parent.ownerId).toBe(owner.id);

  const [row] = await db.select().from(auditLog).where(eq(auditLog.kind, "bom.revision.branched"));
  expect(row.summary).toMatch(/owner .* → /);
  expect(row.payload).toMatchObject({ ownerId: next.id, previousOwnerId: owner.id });
});

test("branchRevision refuses a viewer or a disabled user as the new owner", async () => {
  const owner = await ensureUser("member");
  const viewer = await ensureUser("viewer");
  const disabled = await ensureUser("member");
  await db.update(user).set({ disabled: true }).where(eq(user.id, disabled.id));
  const { revisionId, bomId } = await committedBom(owner.id);

  for (const candidate of [viewer.id, disabled.id, "no-such-user"]) {
    await expect(branchRevision({ parentRevisionId: revisionId, ownerId: candidate })).rejects.toThrow(/OWNER_NOT_ELIGIBLE/);
  }
  const revs = await db.select().from(bomRevisions).where(eq(bomRevisions.bomId, bomId));
  const [bom] = await db.select().from(boms).where(eq(boms.id, bomId));
  expect(revs).toHaveLength(1);
  expect(bom.ownerId).toBe(owner.id);
});

test("discardDraft removes the revision (cascades lines + sections)", async () => {
  const { revisionId, it } = await setup();
  await addLine({ revisionId, itemId: it.id, qty: 1 });
  await discardDraft({ revisionId });
  const after = await db.select().from(bomRevisions).where(eq(bomRevisions.id, revisionId));
  expect(after).toHaveLength(0);
});

test("discardDraft rejects non-draft revisions", async () => {
  const { revisionId, it } = await setup();
  await addLine({ revisionId, itemId: it.id, qty: 1 });
  await commitRevision({ revisionId });
  await expect(discardDraft({ revisionId })).rejects.toThrow(/NOT_DRAFT/);
});
