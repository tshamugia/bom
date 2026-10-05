"use server";

import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { boms, bomLines, bomRevisions, bomSections, items, projects, vendors } from "@/db/schema";
import { EDITOR_ROLES } from "@/lib/roles";
import {
  BOM_IMPORT_MAX_BYTES,
  type BomImportCommitResult,
  type BomImportFail,
  type BomImportPreviewResult,
  type BomImportRow,
  type BomImportSummary,
} from "@/lib/schemas/bom-import";
import { requireRole } from "../auth-context";
import { audit } from "../audit";
import { isRevisionImmutable } from "../lib/revision-status";
import { touchBom } from "../lib/touch-bom";
import { loadValidatorContext } from "../lib/import-validator-context";
import { ensureCatalogRefs } from "../lib/catalog-refs";
import { parseBomImport, sectionKey, summarizeBomImport, type BomImportContext } from "../lib/bom-import";

const CHUNK = 500;

const CommitTarget = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("new"), projectId: z.string().min(1), name: z.string().trim().min(1).max(200) }),
  z.object({ mode: z.literal("revision"), revisionId: z.string().min(1) }),
]);

function field(formData: FormData, name: string): string | undefined {
  const v = formData.get(name);
  return typeof v === "string" ? v : undefined;
}

async function readUpload(formData: FormData): Promise<{ ok: true; buf: Buffer; fileName: string } | BomImportFail> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "unreadable" };
  if (file.size > BOM_IMPORT_MAX_BYTES) return { ok: false, error: "too_large" };
  return { ok: true, buf: Buffer.from(await file.arrayBuffer()), fileName: file.name };
}

type TargetRevision = { id: string; bomId: string; projectId: string; bomName: string };

async function loadTargetRevision(revisionId: string): Promise<{ ok: true; rev: TargetRevision } | BomImportFail> {
  const [row] = await db
    .select({
      id: bomRevisions.id,
      status: bomRevisions.status,
      bomId: bomRevisions.bomId,
      projectId: boms.projectId,
      bomName: boms.name,
      deletedAt: boms.deletedAt,
    })
    .from(bomRevisions)
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .where(eq(bomRevisions.id, revisionId))
    .limit(1);
  if (!row || row.deletedAt) return { ok: false, error: "revision_not_found" };
  if (isRevisionImmutable(row.status)) return { ok: false, error: "revision_locked" };
  return { ok: true, rev: { id: row.id, bomId: row.bomId, projectId: row.projectId, bomName: row.bomName } };
}

async function loadTargetContent(revisionId: string): Promise<NonNullable<BomImportContext["target"]>> {
  const sections = await db
    .select({ name: bomSections.name })
    .from(bomSections)
    .where(eq(bomSections.revisionId, revisionId));
  const lines = await db
    .select({ sku: items.sku })
    .from(bomLines)
    .innerJoin(items, eq(items.id, bomLines.itemId))
    .where(eq(bomLines.revisionId, revisionId));
  return {
    sectionKeys: new Set(sections.map(s => sectionKey(s.name))),
    skus: new Set(lines.map(l => l.sku)),
  };
}

async function prepare(
  buf: Buffer,
  fileName: string,
  target: BomImportContext["target"],
): Promise<{ ok: true; summary: BomImportSummary & { rows: BomImportRow[] } } | BomImportFail> {
  const parsed = await parseBomImport(buf);
  if (!parsed.ok) {
    return parsed.error === "header_mismatch"
      ? { ok: false, error: "header_mismatch", expected: parsed.expected, found: parsed.found }
      : { ok: false, error: parsed.error };
  }
  const ctx: BomImportContext = { ...(await loadValidatorContext()), target };
  return { ok: true, summary: summarizeBomImport(fileName, parsed, ctx) };
}

function publicSummary(s: BomImportSummary & { rows?: BomImportRow[] }): BomImportSummary {
  const { rows: _rows, ...summary } = s;
  void _rows;
  return summary;
}

/** Dry run: what importing this file would do. Nothing is saved. */
export async function previewBomImport(formData: FormData): Promise<BomImportPreviewResult> {
  await requireRole(...EDITOR_ROLES);
  const upload = await readUpload(formData);
  if (!upload.ok) return upload;

  let target: BomImportContext["target"];
  const revisionId = field(formData, "revisionId");
  if (revisionId) {
    const rev = await loadTargetRevision(revisionId);
    if (!rev.ok) return rev;
    target = await loadTargetContent(revisionId);
  }

  const prepared = await prepare(upload.buf, upload.fileName, target);
  if (!prepared.ok) return prepared;
  return { ok: true, summary: publicSummary(prepared.summary) };
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/**
 * Imports the file as a new BOM (Rev A draft) or into an existing draft, in one
 * transaction. SKUs missing from the catalog are added to it first, with any
 * vendor, category and subcategory they name. Refuses the whole file while any
 * row has an error.
 */
export async function commitBomImport(formData: FormData): Promise<BomImportCommitResult> {
  const session = await requireRole(...EDITOR_ROLES);
  const target = CommitTarget.parse({
    mode: field(formData, "mode"),
    projectId: field(formData, "projectId"),
    name: field(formData, "name"),
    revisionId: field(formData, "revisionId"),
  });
  const upload = await readUpload(formData);
  if (!upload.ok) return upload;

  let existing: TargetRevision | null = null;
  let projectId: string;
  if (target.mode === "new") {
    const [project] = await db
      .select({ id: projects.id, deletedAt: projects.deletedAt })
      .from(projects)
      .where(eq(projects.id, target.projectId))
      .limit(1);
    if (!project || project.deletedAt) return { ok: false, error: "project_not_found" };
    const [taken] = await db
      .select({ id: boms.id })
      .from(boms)
      .where(and(eq(boms.projectId, target.projectId), eq(boms.name, target.name)))
      .limit(1);
    if (taken) return { ok: false, error: "name_taken" };
    projectId = target.projectId;
  } else {
    const rev = await loadTargetRevision(target.revisionId);
    if (!rev.ok) return rev;
    existing = rev.rev;
    projectId = rev.rev.projectId;
  }

  const prepared = await prepare(
    upload.buf,
    upload.fileName,
    existing ? await loadTargetContent(existing.id) : undefined,
  );
  if (!prepared.ok) return prepared;
  const { rows, ...summary } = prepared.summary;
  if (summary.errors.length > 0) return { ok: false, error: "has_errors", summary };

  const userId = session.user.id;
  let result: { bomId: string; revisionId: string; itemsCreated: number; refsCreated: { vendors: number; categories: number; subcategories: number } };
  try {
    result = await db.transaction(async tx => {
      let bomId: string;
      let revisionId: string;
      if (existing) {
        // Re-read under a row lock so a commit landing meanwhile can't be written past.
        const [rev] = await tx
          .select({ status: bomRevisions.status })
          .from(bomRevisions)
          .where(eq(bomRevisions.id, existing.id))
          .for("update");
        if (!rev || isRevisionImmutable(rev.status)) throw new Error("REVISION_LOCKED");
        bomId = existing.bomId;
        revisionId = existing.id;
      } else {
        const t = target as Extract<z.infer<typeof CommitTarget>, { mode: "new" }>;
        const [bom] = await tx.insert(boms).values({
          projectId: t.projectId,
          name: t.name,
          ownerId: userId,
          lastModifiedById: userId,
        }).returning({ id: boms.id });
        const [revision] = await tx.insert(bomRevisions).values({
          bomId: bom.id,
          letter: "A",
          status: "draft",
          ownerId: userId,
        }).returning({ id: bomRevisions.id });
        bomId = bom.id;
        revisionId = revision.id;
      }

      // 1. Catalog: add the SKUs it doesn't have yet.
      let itemsCreated = 0;
      let refsCreated = { vendors: 0, categories: 0, subcategories: 0 };
      const newSkus = new Set(summary.newItems.map(i => i.sku));
      const newRows = rows.filter(r => newSkus.has(r.sku));
      if (newRows.length > 0) {
        const refs = await ensureCatalogRefs(tx, summary);
        refsCreated = refs.created;
        for (let i = 0; i < newRows.length; i += CHUNK) {
          const inserted = await tx.insert(items).values(newRows.slice(i, i + CHUNK).map(r => ({
            sku: r.sku,
            description: r.description,
            manufacturer: r.manufacturer,
            unit: r.unit,
            vendorId: r.vendorCode ? refs.vendorIdByCode.get(r.vendorCode) ?? null : null,
            categoryId: r.category ? refs.catIdByName.get(r.category) ?? null : null,
            subcategoryId: r.category && r.subcategory ? refs.subIdByPair.get(`${r.category}::${r.subcategory}`) ?? null : null,
          }))).onConflictDoNothing({ target: items.sku }).returning({ id: items.id });
          itemsCreated += inserted.length;
        }
      }

      const itemBySku = new Map<string, { id: string; sku: string; description: string; manufacturer: string; unit: string; vendorName: string | null }>();
      const skus = rows.map(r => r.sku);
      for (let i = 0; i < skus.length; i += CHUNK) {
        const found = await tx
          .select({
            id: items.id,
            sku: items.sku,
            description: items.description,
            manufacturer: items.manufacturer,
            unit: items.unit,
            vendorName: vendors.name,
          })
          .from(items)
          .leftJoin(vendors, eq(vendors.id, items.vendorId))
          .where(inArray(items.sku, skus.slice(i, i + CHUNK)));
        for (const it of found) itemBySku.set(it.sku, it);
      }

      // 2. Sections: reuse the draft's by name, add the rest in file order.
      const sectionIdByKey = new Map<string, string>();
      let nextSectionPos = 0;
      if (existing) {
        const current = await tx
          .select({ id: bomSections.id, name: bomSections.name, position: bomSections.position })
          .from(bomSections)
          .where(eq(bomSections.revisionId, revisionId));
        for (const s of current) {
          if (!sectionIdByKey.has(sectionKey(s.name))) sectionIdByKey.set(sectionKey(s.name), s.id);
          nextSectionPos = Math.max(nextSectionPos, s.position + 1);
        }
      }
      for (const s of summary.sections) {
        const key = sectionKey(s.name);
        if (sectionIdByKey.has(key)) continue;
        const [row] = await tx
          .insert(bomSections)
          .values({ revisionId, name: s.name, position: nextSectionPos++ })
          .returning({ id: bomSections.id });
        sectionIdByKey.set(key, row.id);
      }

      // 3. Lines: a SKU already on the draft gets the file's quantity added,
      // the rest go to the end of their section in file order.
      const lineByItem = new Map<string, { id: string; qty: number }>();
      const nextPos = new Map<string | null, number>();
      if (existing) {
        const current = await tx
          .select({ id: bomLines.id, itemId: bomLines.itemId, qty: bomLines.qty, sectionId: bomLines.sectionId, position: bomLines.position })
          .from(bomLines)
          .where(eq(bomLines.revisionId, revisionId));
        for (const l of current) {
          lineByItem.set(l.itemId, { id: l.id, qty: l.qty });
          nextPos.set(l.sectionId, Math.max(nextPos.get(l.sectionId) ?? 0, l.position + 1));
        }
      }

      const inserts: (typeof bomLines.$inferInsert)[] = [];
      for (const r of rows) {
        const item = itemBySku.get(r.sku);
        if (!item) throw new Error(`ITEM_NOT_FOUND:${r.sku}`);
        const current = lineByItem.get(item.id);
        if (current) {
          await tx.update(bomLines).set({ qty: sql`${bomLines.qty} + ${r.qty}` }).where(eq(bomLines.id, current.id));
          continue;
        }
        const sectionId = r.section ? sectionIdByKey.get(sectionKey(r.section))! : null;
        const position = nextPos.get(sectionId) ?? 0;
        nextPos.set(sectionId, position + 1);
        inserts.push({
          revisionId,
          sectionId,
          itemId: item.id,
          qty: r.qty,
          skuSnapshot: item.sku,
          descriptionSnapshot: item.description,
          manufacturerSnapshot: item.manufacturer,
          unitSnapshot: item.unit,
          vendorNameSnapshot: item.vendorName,
          position,
        });
      }
      for (let i = 0; i < inserts.length; i += CHUNK) {
        await tx.insert(bomLines).values(inserts.slice(i, i + CHUNK));
      }

      await touchBom(tx, bomId, userId);
      return { bomId, revisionId, itemsCreated, refsCreated };
    });
  } catch (e) {
    if (e instanceof Error && e.message === "REVISION_LOCKED") return { ok: false, error: "revision_locked" };
    if (target.mode === "new" && isUniqueViolation(e)) return { ok: false, error: "name_taken" };
    return { ok: false, error: "db_error", message: e instanceof Error ? e.message : String(e) };
  }

  const bomName = target.mode === "new" ? target.name : existing!.bomName;
  revalidatePath(`/builder/${projectId}/${result.bomId}`);
  revalidatePath("/builder");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  if (result.itemsCreated > 0) revalidatePath("/catalog");

  if (target.mode === "new") {
    await audit({
      kind: "bom.created",
      refType: "bom",
      refId: result.bomId,
      summary: `BOM "${bomName}" created from ${upload.fileName}`,
      payload: { projectId, name: bomName, revisionId: result.revisionId, source: "import" },
    });
  }
  await audit({
    kind: "bom.imported",
    refType: "bom",
    refId: result.bomId,
    summary: `${summary.lines} line${summary.lines === 1 ? "" : "s"} imported from ${upload.fileName}`
      + (result.itemsCreated > 0 ? ` (${result.itemsCreated} new catalog item${result.itemsCreated === 1 ? "" : "s"})` : ""),
    payload: {
      projectId,
      revisionId: result.revisionId,
      fileName: upload.fileName,
      lines: summary.lines,
      totalQty: summary.totalQty,
      mergedLines: summary.mergedLines,
      sectionsCreated: summary.sections.filter(s => s.isNew).length,
      itemsCreated: result.itemsCreated,
      newSkus: summary.newItems.slice(0, 200).map(i => i.sku),
      autoCreated: result.refsCreated,
    },
  });

  return {
    ok: true,
    projectId,
    bomId: result.bomId,
    revisionId: result.revisionId,
    lines: summary.lines,
    itemsCreated: result.itemsCreated,
  };
}
