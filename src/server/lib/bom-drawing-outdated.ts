import "server-only";
import { eq, max, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingRevisions } from "@/db/schema";

/** Newest revision per drawing that changes the BOM (`bom_impact`). */
export function bomImpactRevisions() {
  return db
    .select({ drawingId: drawingRevisions.drawingId, number: max(drawingRevisions.number).as("impact_number") })
    .from(drawingRevisions)
    .where(eq(drawingRevisions.bomImpact, true))
    .groupBy(drawingRevisions.drawingId)
    .as("bom_impact");
}

/**
 * A BOM reference is outdated once the drawing has a BOM-changing revision
 * newer than both the revision it was built from and the one it was last
 * checked against. Revisions marked "no BOM change" never outdate it.
 */
export function isOutdatedSql(impactNumber: SQLWrapper, linkedNumber: SQLWrapper, checkedNumber: SQLWrapper) {
  return sql<boolean>`coalesce(${impactNumber} > greatest(${linkedNumber}, coalesce(${checkedNumber}, 0)), false)`;
}
