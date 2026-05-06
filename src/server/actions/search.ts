"use server";

import { ilike, or } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, items, vendors } from "@/db/schema";
import { requireSession } from "../auth-context";

export type SearchHit =
  | { kind: "project"; id: string; primary: string; secondary: string; href: string }
  | { kind: "item"; id: string; primary: string; secondary: string; href: string }
  | { kind: "vendor"; id: string; primary: string; secondary: string; href: string };

export async function globalSearch(query: string): Promise<SearchHit[]> {
  await requireSession();
  const q = query.trim();
  if (q.length === 0) return [];
  const like = `%${q}%`;
  const limit = 8;

  const [projectRows, itemRows, vendorRows] = await Promise.all([
    db
      .select({ id: projects.id, code: projects.code, name: projects.name })
      .from(projects)
      .where(or(ilike(projects.name, like), ilike(projects.code, like))!)
      .limit(limit),
    db
      .select({ id: items.id, sku: items.sku, description: items.description, manufacturer: items.manufacturer })
      .from(items)
      .where(or(ilike(items.sku, like), ilike(items.description, like), ilike(items.manufacturer, like))!)
      .limit(limit),
    db
      .select({ id: vendors.id, name: vendors.name, code: vendors.code })
      .from(vendors)
      .where(or(ilike(vendors.name, like), ilike(vendors.code, like))!)
      .limit(limit),
  ]);

  const hits: SearchHit[] = [];
  for (const p of projectRows) {
    hits.push({
      kind: "project",
      id: p.id,
      primary: p.name,
      secondary: p.code,
      href: `/preview/${p.id}`,
    });
  }
  for (const i of itemRows) {
    hits.push({
      kind: "item",
      id: i.id,
      primary: i.description,
      secondary: `${i.sku} · ${i.manufacturer}`,
      href: `/catalog?q=${encodeURIComponent(i.sku)}`,
    });
  }
  for (const v of vendorRows) {
    hits.push({
      kind: "vendor",
      id: v.id,
      primary: v.name,
      secondary: v.code,
      href: `/vendors`,
    });
  }
  return hits;
}
