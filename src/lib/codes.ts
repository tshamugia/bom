// Project and drawing codes are generated, never typed: `<PREFIX>-<NNN>`, the
// prefix drawn from the name ("BMW showroom" → BS-001, "Hilton" → HIL-001).
// The server picks the number (`src/server/lib/codes.ts`); dialogs only show it.
// Client-safe: no server imports.

export const PROJECT_CODE_FALLBACK = "PRJ";
export const DRAWING_CODE_FALLBACK = "DWG";

const NUMBER_DIGITS = 3;
const SINGLE_WORD_LETTERS = 3;
const MAX_INITIALS = 4;

// Georgian national romanization (2002), lowercase Mkhedruli; Mtavruli capitals
// lower-case to these first.
const GEORGIAN: Record<string, string> = {
  ა: "a", ბ: "b", გ: "g", დ: "d", ე: "e", ვ: "v", ზ: "z", თ: "t", ი: "i",
  კ: "k", ლ: "l", მ: "m", ნ: "n", ო: "o", პ: "p", ჟ: "zh", რ: "r", ს: "s",
  ტ: "t", უ: "u", ფ: "p", ქ: "k", ღ: "gh", ყ: "q", შ: "sh", ჩ: "ch", ც: "ts",
  ძ: "dz", წ: "ts", ჭ: "ch", ხ: "kh", ჯ: "j", ჰ: "h",
};

/** Filler words that would only waste an initial ("და" is Georgian "and"). */
const FILLER = new Set(["A", "AN", "AND", "THE", "OF", "FOR", "IN", "ON", "AT", "TO", "DA"]);

/** Georgian to Latin, accents dropped, upper-cased. Anything else non-Latin is left for the caller to drop. */
export function transliterate(text: string): string {
  return Array.from(text.toLowerCase(), ch => GEORGIAN[ch] ?? ch)
    .join("")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
}

/**
 * The letters before the dash: the initials of up to four words, or the first
 * three letters of a single word. `fallback` covers names with no Latin or
 * Georgian letters or digits.
 */
export function codePrefix(name: string, fallback: string): string {
  const words = transliterate(name).split(/[^A-Z0-9]+/).filter(Boolean);
  const meaningful = words.filter(w => !FILLER.has(w));
  const use = meaningful.length > 0 ? meaningful : words;
  if (use.length === 0) return fallback;
  if (use.length === 1) return use[0].slice(0, SINGLE_WORD_LETTERS);
  return use.slice(0, MAX_INITIALS).map(w => w[0]).join("");
}

/** The first `<prefix>-<n>` above every number already used with that prefix. */
export function nextCode(prefix: string, existing: Iterable<string>): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
  let max = 0;
  for (const code of existing) {
    const m = pattern.exec(code.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(NUMBER_DIGITS, "0")}`;
}
