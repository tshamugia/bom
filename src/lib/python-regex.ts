// The dxf-checker compiles Settings' patterns with Python's `re` (3.13). This
// is a client-safe approximation, so Settings can refuse a bad pattern before
// it is saved: Python-only syntax is translated to JavaScript and compiled,
// and the places where Python is stricter than JavaScript are checked by hand.
// When the checker is connected the server also asks it (`/v1/params/validate`),
// which has the last word.

const KNOWN_ESCAPES = new Set("abBdDfnrsStvwWxuUNAZ");
const KNOWN_CLASS_ESCAPES = new Set("abdDfnrsStvwWxuUN");
const GLOBAL_FLAGS = /^\(\?([aiLmsux]+)\)/;

type Scan = { js: string } | { error: string };

/** Index of the `]` closing the class that starts at `i` (`[`), or -1. */
function classEnd(p: string, i: number): number {
  let j = i + 1;
  if (p[j] === "^") j++;
  if (p[j] === "]") j++; // a leading ] is a literal
  for (; j < p.length; j++) {
    if (p[j] === "\\") j++;
    else if (p[j] === "]") return j;
  }
  return -1;
}

function checkEscape(p: string, i: number, inClass: boolean): { len: number; js: string } | { error: string } {
  const c = p[i + 1];
  if (c === undefined) return { error: "the pattern ends with a backslash" };
  if (/[0-9]/.test(c)) return { len: 2, js: `\\${c}` };
  if (!/[A-Za-z]/.test(c)) return { len: 2, js: `\\${c}` };
  const known = inClass ? KNOWN_CLASS_ESCAPES : KNOWN_ESCAPES;
  if (!known.has(c)) return { error: `bad escape \\${c}` };
  if (c === "x") {
    return /^[0-9A-Fa-f]{2}$/.test(p.slice(i + 2, i + 4)) ? { len: 4, js: p.slice(i, i + 4) } : { error: "incomplete escape \\x" };
  }
  if (c === "u") {
    return /^[0-9A-Fa-f]{4}$/.test(p.slice(i + 2, i + 6)) ? { len: 6, js: p.slice(i, i + 6) } : { error: "incomplete escape \\u" };
  }
  if (c === "U") {
    return /^[0-9A-Fa-f]{8}$/.test(p.slice(i + 2, i + 10)) ? { len: 10, js: "." } : { error: "incomplete escape \\U" };
  }
  if (c === "N") {
    const m = /^\{[^}]+\}/.exec(p.slice(i + 2));
    return m ? { len: 2 + m[0].length, js: "." } : { error: "missing {…} after \\N" };
  }
  if (c === "A") return { len: 2, js: "^" };
  if (c === "Z") return { len: 2, js: "$" };
  if (c === "a") return { len: 2, js: "\\x07" };
  return { len: 2, js: `\\${c}` };
}

/** Width of a piece of pattern in characters, or null when it varies (Python's look-behind must be fixed). */
function fixedWidth(p: string): number | null {
  const branches: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "[") { const e = classEnd(p, i); if (e < 0) return null; i = e; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "|" && depth === 0) { branches.push(p.slice(start, i)); start = i + 1; }
  }
  branches.push(p.slice(start));
  if (branches.length > 1) {
    const widths = branches.map(fixedWidth);
    return widths.every(w => w !== null && w === widths[0]) ? widths[0] : null;
  }

  let width = 0;
  for (let i = 0; i < p.length;) {
    let atom = 1;
    const ch = p[i];
    if (ch === "\\") {
      atom = /[bBAZ]/.test(p[i + 1] ?? "") ? 0 : 1;
      i += 2;
    } else if (ch === "[") {
      i = classEnd(p, i) + 1;
    } else if (ch === "(") {
      let d = 0;
      let j = i;
      for (; j < p.length; j++) {
        if (p[j] === "\\") { j++; continue; }
        if (p[j] === "[") { j = classEnd(p, j); continue; }
        if (p[j] === "(") d++;
        else if (p[j] === ")" && --d === 0) break;
      }
      const inner = p.slice(i + 1, j);
      if (/^\?(<?[=!])/.test(inner)) atom = 0;
      else {
        const body = inner.replace(/^\?(P<[^>]+>|:|[aiLmsux-]+:)/, "");
        const w = fixedWidth(body);
        if (w === null) return null;
        atom = w;
      }
      i = j + 1;
    } else if (ch === "^" || ch === "$") {
      atom = 0;
      i++;
    } else {
      i++;
    }
    const q = p[i];
    if (q === "*" || q === "+" || q === "?") return null;
    if (q === "{") {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i));
      if (m) {
        if (m[2] !== undefined && m[3] !== m[1]) return null;
        atom *= Number(m[1]);
        i += m[0].length;
      }
    }
    width += atom;
  }
  return width;
}

/** Walks the pattern once: Python-only syntax → JavaScript, Python-only errors → a message. */
function translate(p: string): Scan {
  let js = "";
  for (let i = 0; i < p.length;) {
    const ch = p[i];
    if (ch === "\\") {
      const e = checkEscape(p, i, false);
      if ("error" in e) return e;
      js += e.js;
      i += e.len;
      continue;
    }
    if (ch === "[") {
      const end = classEnd(p, i);
      if (end < 0) return { error: "unterminated character set" };
      let cls = "[";
      let j = i + 1;
      if (p[j] === "^") { cls += "^"; j++; }
      if (p[j] === "]") { cls += "\\]"; j++; }
      for (; j < end;) {
        if (p[j] === "\\") {
          const e = checkEscape(p, j, true);
          if ("error" in e) return e;
          cls += e.js === "^" || e.js === "$" ? "" : e.js;
          j += e.len;
        } else if (p[j] === "[") {
          cls += "\\[";
          j++;
        } else {
          cls += p[j];
          j++;
        }
      }
      js += `${cls}]`;
      i = end + 1;
      continue;
    }
    if (ch === "(" && p[i + 1] === "?") {
      const rest = p.slice(i + 2);
      if (/^[aiLmsux]+\)/.test(rest)) return { error: "global flags such as (?i) must be at the very start" };
      if (rest.startsWith("#")) {
        const close = p.indexOf(")", i);
        if (close < 0) return { error: "missing ), unterminated comment" };
        i = close + 1;
        continue;
      }
      const named = /^P<([^>]*)>/.exec(rest);
      if (named) {
        if (!/^[A-Za-z_]\w*$/.test(named[1])) return { error: `bad group name ${named[1]}` };
        js += `(?<${named[1]}>`;
        i += 2 + named[0].length;
        continue;
      }
      const ref = /^P=([^)]*)\)/.exec(rest);
      if (ref) {
        js += `\\k<${ref[1]}>`;
        i += 2 + ref[0].length;
        continue;
      }
      if (/^<[A-Za-z_]/.test(rest)) return { error: "named groups are written (?P<name>…) in Python" };
      if (/^\(/.test(rest)) return { error: "conditional groups aren't supported here" };
      const scoped = /^[aiLmsux]*(-[imsx]+)?:/.exec(rest);
      if (scoped && scoped[0] !== ":") {
        js += "(?:";
        i += 2 + scoped[0].length;
        continue;
      }
      const look = /^<([=!])/.exec(rest);
      if (look) {
        let d = 0;
        let j = i;
        for (; j < p.length; j++) {
          if (p[j] === "\\") { j++; continue; }
          if (p[j] === "[") { const e = classEnd(p, j); if (e < 0) break; j = e; continue; }
          if (p[j] === "(") d++;
          else if (p[j] === ")" && --d === 0) break;
        }
        if (fixedWidth(p.slice(i + 4, j)) === null) return { error: "look-behind requires fixed-width pattern" };
      }
    }
    js += ch;
    i++;
  }
  return { js };
}

/** Python's error for this pattern (roughly), or null when Python would compile it. */
export function pythonRegexError(pattern: string): string | null {
  let p = pattern;
  let flags = "";
  const global = GLOBAL_FLAGS.exec(p);
  if (global) {
    if (global[1].includes("x")) return "the verbose flag (?x) isn't supported here";
    if (global[1].includes("L")) return "the L flag only works on bytes patterns";
    for (const f of "ims") if (global[1].includes(f)) flags += f;
    p = p.slice(global[0].length);
  }
  const scan = translate(p);
  if ("error" in scan) return scan.error;
  try {
    new RegExp(scan.js, flags);
    return null;
  } catch (e) {
    // "Invalid regular expression: /(/: Unterminated group" → "Unterminated group"
    const msg = e instanceof Error ? e.message : "";
    const cut = msg.lastIndexOf(": ");
    return (cut >= 0 ? msg.slice(cut + 2) : msg) || "invalid pattern";
  }
}
