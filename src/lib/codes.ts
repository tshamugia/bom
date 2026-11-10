// Codes for projects and drawings. Client-safe: no server imports.
//
// Project codes follow the drawing standard (NAMING §4.2): two-digit year + three
// letters from the name, `25TGT` for "თეგეტა მოტორს". The New project dialog
// suggests both parts and the creator may change them; afterwards only an admin
// changes the code. Codes are never reused, archived projects included.
//
// Drawing codes are generated, never typed: `<PREFIX>-<NNN>`, the prefix drawn
// from the name ("Ground floor plan" → GFP-001). The server picks the number
// (`src/server/lib/codes.ts`); dialogs only show it.

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

// ── Project codes ─────────────────────────────────────

/** Two-digit year + three Latin capitals (NAMING §4.2). */
export const PROJECT_CODE_RE = /^\d{2}[A-Z]{3}$/;
const PROJECT_LETTERS = 3;
const VOWELS = new Set(["A", "E", "I", "O", "U"]);
/** Company forms that would take the first letter: შპს (LLC), სს (JSC). */
const COMPANY_FORMS = new Set(["SHPS", "SS", "LLC", "JSC", "LTD", "INC"]);

export function isProjectCode(code: string): boolean {
  return PROJECT_CODE_RE.test(code);
}

/** The year part for a project started on `date`: 2026 → "26". */
export function projectCodeYear(date: Date = new Date()): string {
  return String(date.getFullYear() % 100).padStart(2, "0");
}

/** Letters-only words of a name, Georgian transliterated, filler words and company forms dropped. */
function letterWords(name: string): string[] {
  const words = transliterate(name).split(/[^A-Z0-9]+/).map(w => w.replace(/[^A-Z]/g, "")).filter(Boolean);
  const meaningful = words.filter(w => !FILLER.has(w) && !COMPANY_FORMS.has(w));
  return meaningful.length > 0 ? meaningful : words;
}

/**
 * Letters the code's three can be drawn from, best first: the consonants of the
 * first word, the other words' initials, their consonants, then the vowels.
 */
function letterPool(words: string[]): string[] {
  const [first, ...rest] = words;
  const tail = first.slice(1).split("");
  return [
    ...tail.filter(ch => !VOWELS.has(ch)),
    ...rest.map(w => w[0]),
    ...rest.flatMap(w => w.slice(1).split("").filter(ch => !VOWELS.has(ch))),
    ...tail.filter(ch => VOWELS.has(ch)),
    ...rest.flatMap(w => w.slice(1).split("").filter(ch => VOWELS.has(ch))),
  ];
}

/**
 * Three letters for a project code: the first letter of the name's first word
 * and the consonants after it — "Tegeta Motors" → TGT, "BMW showroom" → BMW,
 * "Hilton" → HLT. Short words borrow from the next words, then pad with X.
 */
export function projectCodeLetters(name: string): string {
  const words = letterWords(name);
  if (words.length === 0) return PROJECT_CODE_FALLBACK;
  const out = [words[0][0], ...letterPool(words)].slice(0, PROJECT_LETTERS);
  while (out.length < PROJECT_LETTERS) out.push("X");
  return out.join("");
}

/**
 * Other letter triples from the same name, in the order to offer them when the
 * suggested code is taken: the first letter stays, the other two step through
 * the name's letters (TGT taken → TGM, TGR…).
 */
export function projectCodeLetterOptions(name: string): string[] {
  const words = letterWords(name);
  if (words.length === 0) return [PROJECT_CODE_FALLBACK];
  const head = words[0][0];
  const pool = letterPool(words);
  const seen = new Set<string>([projectCodeLetters(name)]);
  const out = [projectCodeLetters(name)];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const letters = head + pool[i] + pool[j];
      if (!seen.has(letters)) {
        seen.add(letters);
        out.push(letters);
      }
    }
  }
  return out;
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
