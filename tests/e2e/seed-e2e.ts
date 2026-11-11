// Data for the Playwright suite (tests/e2e). Run by global-setup.ts before every run.
//
// Safe on a dev database: it only deletes and recreates projects whose name starts
// with "E2E " (their BOMs, revisions, lines and exports go with them), removes the
// E2E… items, vendors and categories the specs added on an earlier run, and makes sure
// the root user can sign in without being sent to change the password. Catalog items
// come from `SEED_MODE=insert src/db/seed-items.ts`, which only adds missing ones.
//
// Each spec that changes a BOM gets its own project, so the specs don't depend on
// the order they run in. drawings-shared.spec.ts gets two projects of drawings.
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import {
  bomLines, bomRevisions, bomSections, boms, categories, drawingRevisions, drawings, items, projects, user, vendors,
} from "@/db/schema";
import { createUserDirect } from "@/server/lib/create-user-direct";
import { E2E_DRAWINGS, E2E_SCENARIOS } from "./e2e-data";

const ROOT_EMAIL = process.env.ROOT_USER_EMAIL ?? "t.shamugia@insta.ge";
const ROOT_PASSWORD = process.env.ROOT_USER_PASSWORD ?? "Password123";

async function rootUserId() {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, ROOT_EMAIL)).limit(1);
  if (!existing) {
    await createUserDirect({ email: ROOT_EMAIL, password: ROOT_PASSWORD, name: "E2E Admin", role: "admin" });
  }
  // A seeded or admin-reset password is temporary; the suite signs in with it as is.
  const [u] = await db
    .update(user)
    .set({ role: "admin", disabled: false, mustChangePassword: false })
    .where(eq(user.email, ROOT_EMAIL))
    .returning({ id: user.id });
  return u.id;
}

async function main() {
  const ownerId = await rootUserId();

  const skus = [...new Set(E2E_SCENARIOS.flatMap(s => s.lines.map(l => l.sku)))];
  const rows = await db
    .select({
      id: items.id, sku: items.sku, description: items.description,
      manufacturer: items.manufacturer, unit: items.unit, vendorName: vendors.name,
    })
    .from(items)
    .leftJoin(vendors, eq(vendors.id, items.vendorId))
    .where(inArray(items.sku, skus));
  const bySku = new Map(rows.map(r => [r.sku, r]));
  const missing = skus.filter(s => !bySku.has(s));
  if (missing.length) throw new Error(`Catalog items missing (run seed-items first): ${missing.join(", ")}`);

  await db.transaction(async tx => {
    const removed = await tx.delete(projects).where(like(projects.name, "E2E %")).returning({ id: projects.id });
    if (removed.length) console.log(`Removed ${removed.length} earlier E2E projects`);
    // What the specs add through the UI is named E2E… too (catalog-import, vendors, dashboard).
    await tx.delete(items).where(like(items.sku, "E2E-%"));
    await tx.delete(vendors).where(like(vendors.code, "E2E%"));
    await tx.delete(categories).where(like(categories.name, "E2E %"));

    for (const s of E2E_SCENARIOS) {
      const [project] = await tx
        .insert(projects)
        .values({ code: s.projectCode, name: s.project, ownerId, clientName: "E2E Client" })
        .returning({ id: projects.id });
      const [bom] = await tx
        .insert(boms)
        .values({ projectId: project.id, name: s.bom, ownerId, lastModifiedById: ownerId })
        .returning({ id: boms.id });
      const [rev] = await tx
        .insert(bomRevisions)
        .values({ bomId: bom.id, letter: "P01", status: "draft", ownerId })
        .returning({ id: bomRevisions.id });
      const [section] = await tx
        .insert(bomSections)
        .values({ revisionId: rev.id, name: "General", position: 0 })
        .returning({ id: bomSections.id });
      await tx.insert(bomLines).values(
        s.lines.map((l, i) => {
          const item = bySku.get(l.sku)!;
          return {
            revisionId: rev.id,
            sectionId: section.id,
            itemId: item.id,
            qty: l.qty,
            skuSnapshot: item.sku,
            descriptionSnapshot: item.description,
            manufacturerSnapshot: item.manufacturer,
            unitSnapshot: item.unit,
            vendorNameSnapshot: item.vendorName,
            position: i,
          };
        }),
      );
    }

    // Drawings (with revision P01) for the shared remark / shared time spec.
    const sets = [
      { project: E2E_DRAWINGS.project, code: E2E_DRAWINGS.projectCode, drawings: E2E_DRAWINGS.drawings },
      { project: E2E_DRAWINGS.otherProject, code: E2E_DRAWINGS.otherProjectCode, drawings: [E2E_DRAWINGS.other] },
    ];
    for (const set of sets) {
      const [project] = await tx
        .insert(projects)
        .values({ code: set.code, name: set.project, ownerId, clientName: "E2E Client" })
        .returning({ id: projects.id });
      for (const d of set.drawings) {
        const [drawing] = await tx
          .insert(drawings)
          .values({ projectId: project.id, code: d.code, name: d.name, ownerId, estimatedHours: 4, createdById: ownerId, lastModifiedById: ownerId })
          .returning({ id: drawings.id });
        await tx.insert(drawingRevisions).values({ drawingId: drawing.id, number: 1, commitMessage: "First issue", createdById: ownerId });
      }
    }
  });

  console.log(`Seeded ${E2E_SCENARIOS.length + 2} E2E projects for ${ROOT_EMAIL}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
