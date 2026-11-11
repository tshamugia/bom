// Settings → DXF check settings → Export: the effective parameters in the
// layout of the drawing-standard-checker skill's rules.yaml, so the skill can
// be brought in line with Revline. Client-safe, no YAML library: the values
// are plain strings, numbers, lists and maps.

import { CHECK_RULE_GROUPS } from "./drawing-check-rules";
import type { CheckRulesConfig } from "./drawing-checks";
import { effectiveRulesYaml, type ParamOverrides } from "./drawing-check-params";

/** PyYAML (YAML 1.1) reads these as booleans or null — they are always quoted. */
const RESERVED = /^(y|n|yes|no|on|off|true|false|null|~)$/i;
/** A string that can stay unquoted in block style. */
const PLAIN = /^[A-Za-z_\u0080-\uFFFF][^:#'"\\`[\]{}|>&*!%@\n]*$/;
/** A list item that can stay unquoted inside [ … ]. */
const FLOW = /^[A-Za-z_][A-Za-z0-9_.$-]*$/;

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

function scalar(v: unknown): string {
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : quote(String(v));
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v);
  return PLAIN.test(s) && !RESERVED.test(s) && s === s.trim() ? s : quote(s);
}

const key = (k: string) => (FLOW.test(k) && !RESERVED.test(k) ? k : quote(k));

const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function emit(value: Record<string, unknown>, indent: number): string[] {
  const pad = " ".repeat(indent);
  const out: string[] = [];
  for (const [k, v] of Object.entries(value)) {
    if (Array.isArray(v)) {
      if (!v.length) out.push(`${pad}${key(k)}: []`);
      else if (v.every(x => typeof x === "string" && FLOW.test(x) && !RESERVED.test(x))) out.push(`${pad}${key(k)}: [${v.join(", ")}]`);
      else out.push(`${pad}${key(k)}:`, ...v.map(x => `${pad}  - ${scalar(x)}`));
    } else if (isMap(v)) {
      if (!Object.keys(v).length) out.push(`${pad}${key(k)}: {}`);
      else out.push(`${pad}${key(k)}:`, ...emit(v, indent + 2));
    } else {
      out.push(`${pad}${key(k)}: ${scalar(v)}`);
    }
  }
  return out;
}

const SECTION_TITLE: Record<string, string> = {
  naming: "NAMING (naming-standard.md)",
  titleblock: "TITLE BLOCK (naming §10.1)",
  drafting: "DRAFTING (drafting-standard.md)",
  severity_overrides: "სიმძიმის გადაფარვა: წესის ID → ERROR | WARNING | INFO",
};

/** Rules an admin switched off, by themselves or with their group. */
export function switchedOffRules(rules: CheckRulesConfig): string[] {
  const groups = new Set(rules.disabledGroups);
  const off = new Set(rules.disabled);
  return CHECK_RULE_GROUPS.flatMap(g => g.rules.filter(r => groups.has(g.id) || off.has(r.id)).map(r => r.id));
}

/**
 * The yaml: Settings' parameters over the standard's defaults, the admin's
 * severities as `severity_overrides`, and — since rules.yaml has no switch for
 * them — the rules that are off in Revline as a comment.
 */
export function exportRulesYaml(i: {
  version: number;
  exportedAt: Date;
  overrides: ParamOverrides;
  rules: CheckRulesConfig;
}): string {
  const doc = effectiveRulesYaml(i.overrides) as unknown as Record<string, unknown>;
  doc.severity_overrides = { ...i.rules.severity };
  const off = switchedOffRules(i.rules);

  const lines = [
    "# ---------------------------------------------------------------------------",
    `# Revline: Settings → Drawings → DXF check settings, version ${i.version}, ${i.exportedAt.toISOString().slice(0, 10)}.`,
    "# drawing-standard-checker-ის rules.yaml-ის ფორმატი: ჩაანაცვლე skill-ის ფაილი, რომ",
    "# სკრიპტები Revline-ის პარამეტრებით მუშაობდეს.",
    ...(off.length
      ? ["# Revline-ში გამორთული წესები (rules.yaml-ს მათი ჩამრთველი არ აქვს):", ...chunk(off, 6).map(c => `#   ${c.join(", ")}`)]
      : []),
    "# ---------------------------------------------------------------------------",
  ];
  for (const [k, v] of Object.entries(doc)) {
    const title = SECTION_TITLE[k];
    if (title) lines.push("", `# ===================== ${title}`, "");
    lines.push(...emit({ [k]: v }, 0));
  }
  return `${lines.join("\n")}\n`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
