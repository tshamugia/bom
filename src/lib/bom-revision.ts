// BOM revisions are numbered like drawing revisions: Rev1, Rev2… The number is
// stored as text in `bom_revision.letter` (named from when revisions were
// A, B, C; migration 0030 renumbered them). Client-safe.

export const FIRST_BOM_REVISION = "1";

/** e.g. "Rev3" */
export function formatBomRevision(label: string): string {
  return `Rev${label}`;
}

/** The label for a BOM's next revision: one more than its highest number. */
export function nextBomRevision(existing: string[]): string {
  const max = existing.reduce((m, l) => (/^\d+$/.test(l) ? Math.max(m, Number(l)) : m), 0);
  return String(max + 1);
}
