import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bomLines, bomRevisions, bomSections } from "@/db/schema";
import { requireSession } from "../auth-context";

export type LineSnapshot = {
  itemId: string;
  sku: string;
  description: string;
  manufacturer: string | null;
  unit: string;
  vendor: string | null;
  qty: number;
  section: string | null;
};

export type LineChange = {
  itemId: string;
  display: { sku: string; description: string };
  changes: {
    sku?: { from: string; to: string };
    description?: { from: string; to: string };
    manufacturer?: { from: string | null; to: string | null };
    unit?: { from: string; to: string };
    vendor?: { from: string | null; to: string | null };
    qty?: { from: number; to: number };
    section?: { from: string | null; to: string | null };
  };
};

export type RevisionDiff = {
  left: { id: string; letter: string };
  right: { id: string; letter: string; status: string };
  sections: {
    added: Array<{ name: string; lineCount: number }>;
    removed: Array<{ name: string; lineCount: number }>;
    renamed: Array<{ from: string; to: string }>;
    reordered: Array<{ name: string; from: number; to: number }>;
  };
  lines: { added: LineSnapshot[]; removed: LineSnapshot[]; changed: LineChange[] };
};

async function loadSide(revisionId: string) {
  const [rev] = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      projectId: bomRevisions.projectId,
    })
    .from(bomRevisions)
    .where(eq(bomRevisions.id, revisionId))
    .limit(1);
  if (!rev) throw new Error("REVISION_NOT_FOUND");

  const sections = await db
    .select({ id: bomSections.id, sectionKey: bomSections.sectionKey, name: bomSections.name, position: bomSections.position })
    .from(bomSections)
    .where(eq(bomSections.revisionId, revisionId));

  const lines = await db
    .select({
      itemId: bomLines.itemId,
      qty: bomLines.qty,
      sku: bomLines.skuSnapshot,
      description: bomLines.descriptionSnapshot,
      manufacturer: bomLines.manufacturerSnapshot,
      unit: bomLines.unitSnapshot,
      vendor: bomLines.vendorNameSnapshot,
      sectionId: bomLines.sectionId,
    })
    .from(bomLines)
    .where(eq(bomLines.revisionId, revisionId));

  return { rev, sections, lines };
}

export async function getRevisionDiff(leftId: string, rightId: string): Promise<RevisionDiff> {
  await requireSession();
  const left = await loadSide(leftId);
  const right = await loadSide(rightId);
  if (left.rev.projectId !== right.rev.projectId) throw new Error("PROJECT_MISMATCH");

  const leftSecByKey = new Map(left.sections.map(s => [s.sectionKey, s]));
  const rightSecByKey = new Map(right.sections.map(s => [s.sectionKey, s]));
  const sections: RevisionDiff["sections"] = { added: [], removed: [], renamed: [], reordered: [] };

  for (const [k, r] of rightSecByKey) {
    if (!leftSecByKey.has(k)) {
      const lineCount = right.lines.filter(l => l.sectionId === r.id).length;
      sections.added.push({ name: r.name, lineCount });
    }
  }
  for (const [k, l] of leftSecByKey) {
    if (!rightSecByKey.has(k)) {
      const lineCount = left.lines.filter(ln => ln.sectionId === l.id).length;
      sections.removed.push({ name: l.name, lineCount });
    } else {
      const r = rightSecByKey.get(k)!;
      if (l.name !== r.name) sections.renamed.push({ from: l.name, to: r.name });
      if (l.position !== r.position) sections.reordered.push({ name: r.name, from: l.position, to: r.position });
    }
  }

  const leftByItem = new Map(left.lines.map(l => [l.itemId, l]));
  const rightByItem = new Map(right.lines.map(l => [l.itemId, l]));
  const sectionNameById = (sec: typeof left.sections, id: string | null) =>
    id ? sec.find(s => s.id === id)?.name ?? null : null;

  const toSnapshot = (l: typeof left.lines[number], side: typeof left): LineSnapshot => ({
    itemId: l.itemId, sku: l.sku, description: l.description,
    manufacturer: l.manufacturer, unit: l.unit, vendor: l.vendor,
    qty: l.qty,
    section: sectionNameById(side.sections, l.sectionId),
  });

  const lines: RevisionDiff["lines"] = { added: [], removed: [], changed: [] };
  for (const [id, r] of rightByItem) {
    if (!leftByItem.has(id)) lines.added.push(toSnapshot(r, right));
  }
  for (const [id, l] of leftByItem) {
    if (!rightByItem.has(id)) {
      lines.removed.push(toSnapshot(l, left));
    } else {
      const r = rightByItem.get(id)!;
      const changes: LineChange["changes"] = {};
      if (l.sku !== r.sku) changes.sku = { from: l.sku, to: r.sku };
      if (l.description !== r.description) changes.description = { from: l.description, to: r.description };
      if (l.manufacturer !== r.manufacturer) changes.manufacturer = { from: l.manufacturer, to: r.manufacturer };
      if (l.unit !== r.unit) changes.unit = { from: l.unit, to: r.unit };
      if (l.vendor !== r.vendor) changes.vendor = { from: l.vendor, to: r.vendor };
      if (l.qty !== r.qty) changes.qty = { from: l.qty, to: r.qty };
      const ls = sectionNameById(left.sections, l.sectionId);
      const rs = sectionNameById(right.sections, r.sectionId);
      if (ls !== rs) changes.section = { from: ls, to: rs };
      if (Object.keys(changes).length > 0) {
        lines.changed.push({ itemId: id, display: { sku: r.sku, description: r.description }, changes });
      }
    }
  }

  return {
    left: { id: left.rev.id, letter: left.rev.letter },
    right: { id: right.rev.id, letter: right.rev.letter, status: right.rev.status },
    sections, lines,
  };
}

export async function listRevisionsForProject(projectId: string) {
  await requireSession();
  return db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      committedAt: bomRevisions.committedAt,
      committedById: bomRevisions.committedById,
      commitMessage: bomRevisions.commitMessage,
      parentRevisionId: bomRevisions.parentRevisionId,
      ownerId: bomRevisions.ownerId,
      createdAt: bomRevisions.createdAt,
    })
    .from(bomRevisions)
    .where(eq(bomRevisions.projectId, projectId));
}
