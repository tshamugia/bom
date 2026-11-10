// BOM revisions follow the drawing standard (NAMING §6) like drawings do: P01,
// P02… until the client approves the BOM, C01, C02… from then on. The label is
// stored as text in `bom_revision.letter` (named from when revisions were A, B,
// C; migration 0030 made them numbers, 0034 P/C). Client-safe.

export const FIRST_BOM_REVISION = "P01";

const pad2 = (n: number) => String(n).padStart(2, "0");
const LABEL_RE = /^([PC])(\d+)$/;

/** P03 / C01 as stored; a bare number (rows written before P/C, test fixtures) reads as P. */
export function formatBomRevision(label: string): string {
  return /^\d+$/.test(label) ? `P${pad2(Number(label))}` : label;
}

function parse(label: string): { kind: "P" | "C"; n: number } | null {
  if (/^\d+$/.test(label)) return { kind: "P", n: Number(label) };
  const m = LABEL_RE.exec(label);
  return m ? { kind: m[1] as "P" | "C", n: Number(m[2]) } : null;
}

export function isCBomRevision(label: string): boolean {
  return parse(label)?.kind === "C";
}

/** The C label a revision gets when the client approves it: one above the BOM's highest C. */
export function nextCBomRevision(existing: string[]): string {
  const maxC = existing.reduce((m, l) => {
    const p = parse(l);
    return p?.kind === "C" ? Math.max(m, p.n) : m;
  }, 0);
  return `C${pad2(maxC + 1)}`;
}

/**
 * The label for a BOM's next revision: the next C once the BOM has one (no
 * going back to P), otherwise one above its highest P.
 */
export function nextBomRevision(existing: string[]): string {
  if (existing.some(isCBomRevision)) return nextCBomRevision(existing);
  const maxP = existing.reduce((m, l) => {
    const p = parse(l);
    return p?.kind === "P" ? Math.max(m, p.n) : m;
  }, 0);
  return `P${pad2(maxP + 1)}`;
}
