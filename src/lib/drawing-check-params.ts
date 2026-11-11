// Parameters of the automatic DXF check (issue #18, stage 3): the defaults and
// the ones admins edit in Settings → Drawings → DXF check settings. Client-safe.
//
// `DEFAULT_RULES_YAML` is a copy of services/dxf-checker/app/checker/rules.yaml
// (tests/unit/lib/drawing-check-params.test.ts fails when they drift apart).
// Settings stores only what differs from it, nested like the yaml, and the
// checker merges that over its own copy: dicts key by key, lists replaced, and
// the code tables (originators, systems, series) replaced whole.

import { pythonRegexError } from "./python-regex";

const r = String.raw;

export const DEFAULT_RULES_YAML = {
  versions: { naming: "0.0.3", drafting: "0.0.5" },
  naming: {
    originators: { INS: "Insta LLC" },
    project_pattern: r`^\d{2}[A-Z]{3}$`,
    zones: { codes: ["ZZ", "ST", "XX"], patterns: [r`^K[1-9]$`] },
    floors: { codes: ["RF", "ZZ", "XX", "M1"], patterns: [r`^B[1-9]$`, r`^\d{2}$`], non_level: ["ZZ", "XX"] },
    systems: {
      GN: "ზოგადი (ყდა, ნუსხა, შენიშვნები)",
      LV: "რამდენიმე სისტემა ერთ ფურცელზე",
      FA: "ხანძრის სიგნალიზაცია",
      VA: "ევაკუაციის გახმოვანება, PA/VA",
      EM: "ავარიული განათება და Exit ნიშნები",
      CC: "ვიდეოთვალთვალი (CCTV)",
      AC: "დაშვების კონტროლი",
      IN: "შეღწევის (დაცვის) სიგნალიზაცია",
      IC: "ინტერკომი, ვიდეოდომოფონი",
      SC: "სტრუქტურირებული კაბელი, LAN, Wi-Fi",
      BM: "BMS, დისპეჩერიზაცია",
      GR: "GRMS",
      AV: "აუდიო-ვიზუალური სისტემები",
      EL: "ელექტრომომარაგება",
    },
    series: {
      "0": "პირობითი აღნიშვნები, ზოგადი შენიშვნები, ნუსხა",
      "1": "სართულის გეგმები",
      "2": "გადიდებული გეგმები",
      "3": "სტრუქტურული და ბლოკ-სქემები, რაიზერები",
      "4": "რეკები, კარადები, პანელების ხედები",
      "5": "მონტაჟის დეტალები და კვანძები",
      "6": "ცხრილები და დოკუმენტები",
      "7": "შეერთების და კლემების სქემები",
      "8": "სარეზერვო",
      "9": "3D ხედები, ფოტოფიქსაცია, კოორდინაცია",
    },
    reserved_series: ["8"],
    plan_series: "1",
    extension_series: { xlsx: ["6"], xls: ["6"], csv: ["6"], docx: ["6", "0"], rvt: ["9"] },
    drawing_extensions: ["dwg", "dxf", "pdf"],
    checked_extensions: ["dwg", "dxf", "pdf", "xlsx", "xls", "csv", "docx", "rvt"],
    forbidden_tokens: [
      r`(?i)(^|[\s_\-.])final($|[\s_\-.])`,
      r`(?i)(^|[\s_\-.])new($|[\s_\-.])`,
      r`(?i)(^|[\s_\-.])old($|[\s_\-.])`,
      r`(?i)(^|[\s_\-.])copy($|[\s_\-.])`,
      r`(?i)(^|[\s_\-.])v\d+($|[\s_\-.])`,
      r`(?i)ასლი|ახალი|ძველი|საბოლოო`,
      r`\(\d+\)`,
    ],
    date_patterns: [r`\d{4}-\d{2}-\d{2}`, r`(?<!\d)20\d{6}(?!\d)`, r`\d{2}[.\-]\d{2}[.\-]\d{4}`],
    folders: {
      wip: "01_WIP",
      issued: "02_ISSUED",
      current: "03_CURRENT",
      received: "04_RECEIVED",
      bom: "05_BOM",
      other: "06_OTHER",
    },
    issue_folder_pattern: r`^\d{4}-\d{2}-\d{2}_[PC]\d{2}$`,
    project_folder_pattern: r`^(\d{2}[A-Z]{3})_`,
    register_name_pattern: r`^(\d{2}[A-Z]{3})_DRAWING_REGISTER\.xlsx$`,
    current_allowed_extensions: ["pdf"],
    junk_extensions: ["bak", "dwl", "dwl2", "sv$", "tmp", "log", "err"],
    ignore_names: [r`^~\$`, r`^Thumbs\.db$`, r`^desktop\.ini$`, r`^\.`],
    transmittal_pattern: r`^TR-(\d{2}[A-Z]{3})-\d{3}$`,
    cancelled_marker: "გაუქმებულია",
  },
  titleblock: {
    block_name_patterns: ["(?i)title", "(?i)stamp", "(?i)shtamp", r`(?i)^tb[_\-]?`, "(?i)ramka", "(?i)frame", "შტამპ"],
    min_matched_fields: 2,
    fields: {
      sheet_no: ["SHEET_NO", "SHEETNO", "SHEET_NUMBER", "SHEET_NUM", "SHEET", "DWG_NO", "DRAWING_NO", "DRW_NO", "NOMERI", "FURCELI"],
      title: ["TITLE", "DWG_TITLE", "DRAWING_TITLE", "SHEET_TITLE", "SHEET_NAME", "NAME", "DASAXELEBA", "TITLE1"],
      file_name: ["FILE_NAME", "FILENAME", "FILE", "DOC_NO", "DOCUMENT_NO", "DOC_NUMBER", "DOCNO"],
      revision: ["REV", "REVISION", "REV_NO", "REVNO", "CUR_REV", "REVIZIA"],
      project: ["PROJECT", "PROJECT_NO", "PROJECT_NUMBER", "PROJ_NO", "PROJ", "OBJECT", "PROJECT_NAME", "OBIEKTI"],
      drawn: ["DRAWN", "DRAWN_BY", "DRAWNBY", "DESIGNED", "DESIGNED_BY", "AUTHOR", "SHEASRULA"],
      checked: ["CHECKED", "CHECKED_BY", "CHECKEDBY", "SHEAMOWMA"],
      approved: ["APPROVED", "APPROVED_BY", "APPROVEDBY", "DAAMTKICA"],
      scale: ["SCALE", "MASSHTABI"],
      format: ["FORMAT", "SIZE", "SHEET_SIZE", "PAPER", "PAPER_SIZE"],
      typical: ["TYPICAL", "TYPICAL_N", "TYPICAL_X", "TYP", "TIPIURI"],
    },
    required: ["sheet_no", "title", "file_name", "revision", "project", "drawn", "checked", "approved", "scale", "format"],
    signature_fields: ["drawn", "checked", "approved"],
    revision_table_tag_pattern: r`(?i)^REV[_\-]?\d+([_\-].*)?$`,
    scale_pattern: r`^(1:\d+|NTS|N\.T\.S\.|—|-)$`,
    format_pattern: r`^A[0-4](x\d+)?$`,
  },
  drafting: {
    insunits_required: 4,
    min_model_extent_mm: 1000,
    legend_layer: "LEGEND",
    cable_layer_prefix: "CBL-",
    cable_layer_pattern: r`^CBL-[A-Z0-9]+-[A-Z0-9.\-]+$`,
    cable_allowed_types: ["LINE", "LWPOLYLINE", "POLYLINE"],
    cable_like_layer_hints: ["(?i)cable", "(?i)kabel", "(?i)wire", "(?i)trassa", "კაბელ"],
    duplicate_tolerance_mm: 1.0,
    max_paper_layouts: 1,
    copy_block_patterns: [r`(?i)[_\-](old|new|copy|bak|orig)\d*$`, "(?i)copy", r`\(\d+\)$`, r`[_\-]\d+$`, r`\$0\$`, r`^A\$C[0-9A-F]+$`],
    approved_blocks: [] as string[],
    non_device_block_patterns: ["(?i)north", "(?i)logo", "(?i)arrow", "(?i)scale.?bar", "(?i)revcloud", "(?i)section", "(?i)grid", "(?i)tag$"],
    sku_strong_patterns: [
      r`\bDS-\d[A-Z0-9\-]{4,}`,
      r`\bDH-[A-Z]{2,}[A-Z0-9\-]{3,}`,
      r`\bIPC-[A-Z0-9]{3,}[A-Z0-9\-]*`,
      r`\bNFX?[A-Z]?-[A-Z0-9]{3,}`,
      r`\b\d{6}\.\d{2,3}\b`,
      r`\b55000-\d{3}\b`,
      r`\bFAP-\d{3,}`,
    ],
    sku_generic_pattern: r`\b(?=[A-Z0-9\-./]*[A-Z])(?=(?:[A-Z\-./]*\d){2})[A-Z0-9][A-Z0-9\-./]{4,}\b`,
    sku_whitelist: [
      "FP200", "FP400", "FP200GOLD", "CAT5E", "CAT6", "CAT6A", "CAT7", "OM3", "OM4", "OS2", "LIYCY", "JYSTY", "NYM", "NYY",
      "POE", "IP65", "IP66", "IP67", "IK10", "RS485", "RS232", "24VDC", "230VAC", "12VDC",
    ],
    sku_exclude_patterns: [
      r`^[A-Z]{2}-\d{3}$`,
      r`^[A-Z]{3}-\d{2}[A-Z]{3}-[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z]{2}-\d{3}`,
      r`^[PC]\d{2}(\.\d{2})?$`,
      r`^TR-\d{2}[A-Z]{3}-\d{3}$`,
      r`^\d+[X×]\d+`,
      r`^\d{2}[A-Z]{3}$`,
    ],
    typical_keywords: ["ტიპიური", "(?i)typical"],
  },
  severity_overrides: {} as Record<string, string>,
};

export type CheckParamKind =
  | "regex" // one pattern
  | "regex-list" // patterns, one per line
  | "text" // one value
  | "code-list" // codes, one per line
  | "word-list" // names or words, one per line
  | "code-map" // "CODE: description" per line
  | "tag-map" // "field: TAG, TAG" per title-block field
  | "int"
  | "number";

export const CHECK_PARAM_SECTIONS = [
  { id: "codes", label: "Codes in the file name", sub: "What the fields of a file name may contain (NAMING §4–5)." },
  { id: "name", label: "File name", sub: "Words and dates a file name must not contain (NAMING §8)." },
  { id: "title-block", label: "Title block", sub: "How the title block is found and read (NAMING §10)." },
  { id: "drawing", label: "Drawing content", sub: "Units, legend, layers, blocks and model codes (DRAFTING)." },
] as const;

export type CheckParamSectionId = (typeof CHECK_PARAM_SECTIONS)[number]["id"];

export type CheckParam = {
  /** Dotted path in rules.yaml — also the id. */
  id: string;
  section: CheckParamSectionId;
  kind: CheckParamKind;
  label: string;
  hint?: string;
  /** Rules that read it — so an admin sees what a change affects. */
  rules: readonly string[];
  /** Shape of a code (code-list, code-map keys) or of a text value. */
  pattern?: RegExp;
  patternHint?: string;
  min?: number;
  max?: number;
  /** For cable layers: `{systems}` stands for any system code. */
  placeholders?: readonly string[];
};

const CODE2 = { pattern: /^[A-Z0-9]{2}$/, patternHint: "two capital letters or digits" };
const DIGIT = { pattern: /^[0-9]$/, patternHint: "one digit" };
/** AutoCAD refuses these in layer and block names. */
const CAD_NAME = { pattern: /^[^<>/\\":;?*|=,`]{1,255}$/, patternHint: "an AutoCAD name, without < > / \\ \" : ; ? * | = , `" };

export const CHECK_PARAMS: readonly CheckParam[] = [
  // ── Codes in the file name ──
  { id: "naming.originators", section: "codes", kind: "code-map", label: "Originators", hint: "Who made the file (§4.1). Other participants' codes are added when a project starts.", rules: ["N-ORIG-UNKNOWN"], pattern: /^[A-Z]{3}$/, patternHint: "three capital letters" },
  { id: "naming.project_pattern", section: "codes", kind: "regex", label: "Project code", hint: "Two-digit year and three letters, e.g. 26TGT (§4.2).", rules: ["N-PROJECT"] },
  { id: "naming.zones.codes", section: "codes", kind: "code-list", label: "Zone codes", hint: "§4.3.", rules: ["N-ZONE"], ...CODE2 },
  { id: "naming.zones.patterns", section: "codes", kind: "regex-list", label: "Zone code patterns", hint: "Zones that follow a pattern, e.g. K1…K9.", rules: ["N-ZONE"] },
  { id: "naming.floors.codes", section: "codes", kind: "code-list", label: "Floor codes", hint: "§4.4.", rules: ["N-FLOOR", "T-FLOOR"], ...CODE2 },
  { id: "naming.floors.patterns", section: "codes", kind: "regex-list", label: "Floor code patterns", hint: "Floors that follow a pattern, e.g. B1…B9, 00…99.", rules: ["N-FLOOR", "T-FLOOR"] },
  { id: "naming.floors.non_level", section: "codes", kind: "code-list", label: "Codes that aren't one floor", hint: "Several floors or none — a plan (1xx) needs a real floor.", rules: ["N-PLAN-FLOOR", "T-FLOOR"], ...CODE2 },
  { id: "naming.systems", section: "codes", kind: "code-map", label: "System codes", hint: "§4.5. Cable layer names may use them too.", rules: ["N-SYSTEM", "D13-CABLE-LAYER-NAME"], pattern: /^[A-Z]{2}$/, patternHint: "two capital letters" },
  { id: "naming.series", section: "codes", kind: "code-map", label: "Number series", hint: "The first digit of the number (§5).", rules: [], ...DIGIT },
  { id: "naming.reserved_series", section: "codes", kind: "code-list", label: "Reserved series", hint: "Numbers in these series are flagged.", rules: ["N-SERIES-RESERVED"], ...DIGIT },
  { id: "naming.plan_series", section: "codes", kind: "text", label: "Floor plan series", hint: "Plans need a real floor code.", rules: ["N-PLAN-FLOOR", "T-FLOOR"], ...DIGIT },

  // ── File name ──
  { id: "naming.forbidden_tokens", section: "name", kind: "regex-list", label: "Forbidden words", hint: "final, new, old, copy, v2… Case is ignored where the pattern starts with (?i).", rules: ["N-FORBIDDEN"] },
  { id: "naming.date_patterns", section: "name", kind: "regex-list", label: "Date formats", hint: "Dates belong in the register, not the name.", rules: ["N-DATE"] },

  // ── Title block ──
  { id: "titleblock.block_name_patterns", section: "title-block", kind: "regex-list", label: "Title block names", hint: "A block whose name matches counts as the title block whatever its attributes.", rules: ["T-MISSING"] },
  { id: "titleblock.min_matched_fields", section: "title-block", kind: "int", label: "Fields that identify a title block", hint: "Any other block counts once it has this many known fields.", rules: ["T-MISSING"], min: 1, max: 11 },
  { id: "titleblock.fields", section: "title-block", kind: "tag-map", label: "Field tags", hint: "Attribute tags each field may have, case ignored. Add your title block's real tags here.", rules: ["T-FIELD-MISSING", "T-FIELD-EMPTY", "T-SHEET", "T-FILENAME", "T-REV", "T-PROJECT", "T-SCALE", "T-FORMAT", "D17-TYPICAL"], pattern: /^[^\s,:]{1,100}$/, patternHint: "a tag without spaces, commas or colons" },
  { id: "titleblock.required", section: "title-block", kind: "word-list", label: "Required fields", hint: "Fields every title block must have.", rules: ["T-FIELD-MISSING", "T-FIELD-EMPTY"] },
  { id: "titleblock.signature_fields", section: "title-block", kind: "word-list", label: "Signature fields", hint: "May stay empty while a drawing is work in progress.", rules: ["T-FIELD-EMPTY"] },
  { id: "titleblock.revision_table_tag_pattern", section: "title-block", kind: "regex", label: "Revision table tags", hint: "Attributes of the revision table, e.g. REV1, REV1_DATE.", rules: ["T-REVTABLE"] },
  { id: "titleblock.scale_pattern", section: "title-block", kind: "regex", label: "Scale format", hint: "e.g. 1:100 or NTS.", rules: ["T-SCALE"] },
  { id: "titleblock.format_pattern", section: "title-block", kind: "regex", label: "Sheet size format", hint: "e.g. A1 or A3x3.", rules: ["T-FORMAT"] },

  // ── Drawing content ──
  { id: "drafting.insunits_required", section: "drawing", kind: "int", label: "INSUNITS", hint: "Drawing units: 4 = millimetres (rule 15).", rules: ["D15-UNITS"], min: 0, max: 24 },
  { id: "drafting.min_model_extent_mm", section: "drawing", kind: "number", label: "Smallest model size, mm", hint: "A smaller model is probably drawn in metres (rule 15).", rules: ["D15-SCALE"], min: 0, max: 1_000_000_000 },
  { id: "drafting.legend_layer", section: "drawing", kind: "text", label: "Legend layer", hint: "Rule 12.", rules: ["D08-LEGEND-MISSING", "D09-LEGEND-SYMBOL", "D11-LEGEND-BLOCK", "D11-LEGEND-CABLE", "D11-LEGEND-UNITS", "D12-LEGEND-LAYER"], ...CAD_NAME },
  { id: "drafting.cable_layer_prefix", section: "drawing", kind: "text", label: "Cable layer prefix", hint: "Rule 13.", rules: ["D13-CABLE-LAYER-NAME", "D13-CABLE-OFF-LAYER", "D14-CABLE-CONTENT", "D11-LEGEND-CABLE"], ...CAD_NAME },
  { id: "drafting.cable_layer_pattern", section: "drawing", kind: "regex", label: "Cable layer name", hint: "Rule 13. {systems} stands for any system code.", rules: ["D13-CABLE-LAYER-NAME"], placeholders: ["{systems}"] },
  { id: "drafting.cable_allowed_types", section: "drawing", kind: "word-list", label: "Objects allowed on cable layers", hint: "DXF entity types (rule 14).", rules: ["D14-CABLE-CONTENT"], pattern: /^[A-Z][A-Z0-9_]{0,40}$/, patternHint: "a DXF entity type in capitals, e.g. LWPOLYLINE" },
  { id: "drafting.cable_like_layer_hints", section: "drawing", kind: "regex-list", label: "Layers that look like cables", hint: "Flagged when they don't start with the cable prefix.", rules: ["D13-CABLE-OFF-LAYER"] },
  { id: "drafting.duplicate_tolerance_mm", section: "drawing", kind: "number", label: "Duplicate block distance, mm", hint: "Blocks closer than this count as duplicates (rule 6).", rules: ["D06-DUPLICATE"], min: 0, max: 1000 },
  { id: "drafting.max_paper_layouts", section: "drawing", kind: "int", label: "Layouts per file", hint: "Rule 16.", rules: ["D16-LAYOUTS"], min: 1, max: 50 },
  { id: "drafting.copy_block_patterns", section: "drawing", kind: "regex-list", label: "Copied block names", hint: "Signs of a pasted or old block copy (rule 2).", rules: ["D02-COPY-BLOCK"] },
  { id: "drafting.approved_blocks", section: "drawing", kind: "word-list", label: "Approved blocks", hint: "The block library (rule 3). Empty: the rule checks nothing yet.", rules: ["D03-UNAPPROVED"], ...CAD_NAME },
  { id: "drafting.non_device_block_patterns", section: "drawing", kind: "regex-list", label: "Blocks that aren't devices", hint: "North arrow, logo, grid… — not expected in the legend.", rules: ["D01-EXPLODED", "D11-LEGEND-BLOCK", "D06-DUPLICATE"] },
  { id: "drafting.sku_strong_patterns", section: "drawing", kind: "regex-list", label: "Manufacturer model codes", hint: "Certain model codes (rule 7).", rules: ["D07-SKU-STRONG"] },
  { id: "drafting.sku_generic_pattern", section: "drawing", kind: "regex", label: "Text that may be a model code", hint: "Rule 7.", rules: ["D07-SKU"] },
  { id: "drafting.sku_whitelist", section: "drawing", kind: "word-list", label: "Allowed codes", hint: "Cable types, IP ratings… that look like model codes but aren't.", rules: ["D07-SKU"], pattern: /^\S{1,100}$/, patternHint: "one word" },
  { id: "drafting.sku_exclude_patterns", section: "drawing", kind: "regex-list", label: "Text that is never a model code", hint: "Sheet numbers, file names, revisions…", rules: ["D07-SKU", "D07-SKU-STRONG"] },
  { id: "drafting.typical_keywords", section: "drawing", kind: "regex-list", label: "Typical floor words", hint: "A title with these needs the floor count (rule 17).", rules: ["D17-TYPICAL"] },
];

const PARAM_BY_ID = new Map(CHECK_PARAMS.map(p => [p.id, p]));

export function checkParam(id: string): CheckParam | undefined {
  return PARAM_BY_ID.get(id);
}

export const TITLE_BLOCK_FIELDS = Object.keys(DEFAULT_RULES_YAML.titleblock.fields);

// ── Values ─────────────────────────────────────────────────────────────────

export type ParamValue = string | number | string[] | Record<string, string> | Record<string, string[]>;
/** What Settings stores in `drawing_check_config.params`: only values that differ from the defaults, nested like rules.yaml. */
export type ParamOverrides = Record<string, unknown>;

/** Every value here is plain JSON. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function getAt(obj: unknown, path: string[]): unknown {
  let cur = obj;
  for (const k of path) {
    if (!isObj(cur) || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function setAt(obj: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  const [head, ...rest] = path;
  if (!rest.length) return { ...obj, [head]: value };
  const child = isObj(obj[head]) ? obj[head] : {};
  return { ...obj, [head]: setAt(child, rest, value) };
}

function without(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const keep = { ...obj };
  delete keep[key];
  return keep;
}

function deleteAt(obj: Record<string, unknown>, path: string[]): Record<string, unknown> {
  const [head, ...rest] = path;
  if (!(head in obj)) return obj;
  if (!rest.length) return without(obj, head);
  const child = obj[head];
  if (!isObj(child)) return obj;
  const next = deleteAt(child, rest);
  return Object.keys(next).length ? { ...obj, [head]: next } : without(obj, head);
}

export function defaultParamValue(p: CheckParam): ParamValue {
  return getAt(DEFAULT_RULES_YAML, p.id.split(".")) as ParamValue;
}

/** Order-sensitive for lists, order-free for maps — the yaml's own semantics. */
export function sameParamValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameParamValue(x, b[i]));
  }
  if (isObj(a) || isObj(b)) {
    if (!isObj(a) || !isObj(b)) return false;
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every(k => k in b && sameParamValue(a[k], b[k]));
  }
  return a === b;
}

/** The value a check uses: the admin's override, else the standard's default. */
export function paramValue(overrides: ParamOverrides, p: CheckParam): ParamValue {
  const v = getAt(overrides, p.id.split("."));
  return v === undefined ? defaultParamValue(p) : (v as ParamValue);
}

/**
 * Stored overrides, cleaned: anything that isn't a known parameter, doesn't
 * validate any more or equals the default is dropped, so the checker only
 * ever gets values Settings would accept now.
 */
export function parseParamOverrides(value: unknown): ParamOverrides {
  let out: ParamOverrides = {};
  for (const p of CHECK_PARAMS) {
    const v = getAt(value, p.id.split("."));
    if (v === undefined) continue;
    const checked = validateParamValue(p, v);
    if (checked.ok && !sameParamValue(checked.value, defaultParamValue(p))) out = setAt(out, p.id.split("."), checked.value);
  }
  return out;
}

/** Overrides with these values applied; a value equal to the default removes the override. */
export function applyParamValues(overrides: ParamOverrides, values: Record<string, ParamValue>): ParamOverrides {
  let out = overrides;
  for (const [id, v] of Object.entries(values)) {
    const p = checkParam(id);
    if (!p) continue;
    const path = id.split(".");
    out = sameParamValue(v, defaultParamValue(p)) ? deleteAt(out, path) : setAt(out, path, v);
  }
  return out;
}

/** Parameters whose effective value differs between two override sets — for the audit row. */
export function changedParams(before: ParamOverrides, after: ParamOverrides): CheckParam[] {
  return CHECK_PARAMS.filter(p => !sameParamValue(paramValue(before, p), paramValue(after, p)));
}

/** Every parameter with its effective value, nested like rules.yaml — for the export. */
export function effectiveRulesYaml(overrides: ParamOverrides): typeof DEFAULT_RULES_YAML {
  let out = clone(DEFAULT_RULES_YAML) as unknown as Record<string, unknown>;
  for (const p of CHECK_PARAMS) out = setAt(out, p.id.split("."), clone(paramValue(overrides, p)));
  return out as unknown as typeof DEFAULT_RULES_YAML;
}

// ── Validation ─────────────────────────────────────────────────────────────

const MAX_PATTERN = 500;
const MAX_ITEMS = 200;
const MAX_TEXT = 255;

export type ParamCheck = { ok: true; value: ParamValue } | { ok: false; errors: string[] };

function regexError(p: CheckParam, pattern: string): string | null {
  if (!pattern.trim()) return "A pattern can't be empty.";
  if (pattern.length > MAX_PATTERN) return `“${pattern.slice(0, 40)}…” is longer than ${MAX_PATTERN} characters.`;
  let src = pattern;
  for (const ph of p.placeholders ?? []) src = src.split(ph).join("(?:X)");
  const err = pythonRegexError(src);
  return err ? `“${pattern}” isn't a valid pattern: ${err}.` : null;
}

function itemError(p: CheckParam, item: string): string | null {
  if (!item.trim()) return "Empty values aren't allowed.";
  if (item.length > MAX_TEXT) return `“${item.slice(0, 40)}…” is longer than ${MAX_TEXT} characters.`;
  if (p.pattern && !p.pattern.test(item)) return `“${item}” isn't ${p.patternHint ?? "allowed here"}.`;
  return null;
}

function duplicates(items: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const i of items) (seen.has(i) ? dup : seen).add(i);
  return [...dup];
}

/** Checks one value as it will reach the checker. Regexes are compiled the way Python would. */
export function validateParamValue(p: CheckParam, value: unknown): ParamCheck {
  const errors: string[] = [];
  const done = (v: ParamValue): ParamCheck => (errors.length ? { ok: false, errors } : { ok: true, value: v });

  switch (p.kind) {
    case "regex": {
      if (typeof value !== "string") return { ok: false, errors: ["Enter a pattern."] };
      const e = regexError(p, value);
      if (e) errors.push(e);
      return done(value);
    }
    case "text": {
      if (typeof value !== "string") return { ok: false, errors: ["Enter a value."] };
      const v = value.trim();
      const e = itemError(p, v);
      if (e) errors.push(e);
      return done(v);
    }
    case "int":
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, errors: ["Enter a number."] };
      if (p.kind === "int" && !Number.isInteger(value)) errors.push("Enter a whole number.");
      if (p.min !== undefined && value < p.min) errors.push(`The smallest value is ${p.min}.`);
      if (p.max !== undefined && value > p.max) errors.push(`The largest value is ${p.max}.`);
      return done(value);
    }
    case "regex-list":
    case "code-list":
    case "word-list": {
      if (!Array.isArray(value) || !value.every(v => typeof v === "string")) return { ok: false, errors: ["Enter one value per line."] };
      const items = value.map(v => (p.kind === "regex-list" ? v : v.trim()));
      if (items.length > MAX_ITEMS) errors.push(`At most ${MAX_ITEMS} lines.`);
      for (const item of items) {
        const e = p.kind === "regex-list" ? regexError(p, item) : itemError(p, item);
        if (e) errors.push(e);
      }
      if (p.id === "titleblock.required" || p.id === "titleblock.signature_fields") {
        for (const f of items) if (!TITLE_BLOCK_FIELDS.includes(f)) errors.push(`“${f}” isn't a title block field (${TITLE_BLOCK_FIELDS.join(", ")}).`);
      }
      for (const d of duplicates(items)) errors.push(`“${d}” is listed twice.`);
      return done(items);
    }
    case "code-map": {
      if (!isObj(value) || !Object.values(value).every(v => typeof v === "string")) return { ok: false, errors: ["Enter one code per line."] };
      const out: Record<string, string> = {};
      const entries = Object.entries(value as Record<string, string>);
      if (entries.length > MAX_ITEMS) errors.push(`At most ${MAX_ITEMS} codes.`);
      if (!entries.length) errors.push("Add at least one code.");
      for (const [k, v] of entries) {
        const e = itemError(p, k);
        if (e) errors.push(e);
        if (v.length > MAX_TEXT) errors.push(`The description of ${k} is longer than ${MAX_TEXT} characters.`);
        out[k] = v.trim();
      }
      return done(out);
    }
    case "tag-map": {
      if (!isObj(value)) return { ok: false, errors: ["Enter the tags of each field."] };
      const out: Record<string, string[]> = {};
      for (const k of Object.keys(value)) if (!TITLE_BLOCK_FIELDS.includes(k)) errors.push(`“${k}” isn't a title block field.`);
      for (const f of TITLE_BLOCK_FIELDS) {
        const tags = value[f] ?? [];
        if (!Array.isArray(tags) || !tags.every(t => typeof t === "string")) {
          errors.push(`${f}: enter tags separated by commas.`);
          continue;
        }
        const clean = tags.map(t => t.trim().toUpperCase());
        if (clean.length > MAX_ITEMS) errors.push(`${f}: at most ${MAX_ITEMS} tags.`);
        for (const t of clean) {
          const e = itemError(p, t);
          if (e) errors.push(`${f}: ${e}`);
        }
        for (const d of duplicates(clean)) errors.push(`${f}: “${d}” is listed twice.`);
        out[f] = clean;
      }
      return done(out);
    }
  }
}

/** Rules that span parameters, on the values a check would use. */
export function crossParamErrors(overrides: ParamOverrides): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const fields = paramValue(overrides, checkParam("titleblock.fields")!) as Record<string, string[]>;
  const required = paramValue(overrides, checkParam("titleblock.required")!) as string[];
  const noTags = required.filter(f => !fields[f]?.length);
  if (noTags.length) {
    out["titleblock.fields"] = [`Required fields need at least one tag: ${noTags.join(", ")}.`];
  }
  return out;
}

// ── Text in the forms ──────────────────────────────────────────────────────

/** How a value is shown in its form field. */
export function formatParamText(p: CheckParam, value: ParamValue): string {
  switch (p.kind) {
    case "regex":
    case "text":
      return String(value);
    case "int":
    case "number":
      return String(value);
    case "regex-list":
    case "code-list":
    case "word-list":
      return (value as string[]).join("\n");
    case "code-map":
      return Object.entries(value as Record<string, string>).map(([k, v]) => (v ? `${k}: ${v}` : k)).join("\n");
    case "tag-map":
      return TITLE_BLOCK_FIELDS.map(f => `${f}: ${((value as Record<string, string[]>)[f] ?? []).join(", ")}`).join("\n");
  }
}

export type ParamParse = { ok: true; value: ParamValue } | { ok: false; errors: string[] };

const lines = (text: string) => text.split(/\r?\n/).map(l => l.replace(/\s+$/, "")).filter(l => l.trim() !== "");

/** What an admin typed → the value to save (still to be validated). */
export function parseParamText(p: CheckParam, text: string): ParamParse {
  switch (p.kind) {
    case "regex":
      return { ok: true, value: text.trim() };
    case "text":
      return { ok: true, value: text.trim() };
    case "int":
    case "number": {
      const t = text.trim().replace(",", ".");
      if (!/^-?\d+(\.\d+)?$/.test(t)) return { ok: false, errors: ["Enter a number."] };
      return { ok: true, value: Number(t) };
    }
    case "regex-list":
      return { ok: true, value: lines(text).map(l => l.trim()) };
    case "code-list":
    case "word-list":
      return { ok: true, value: lines(text).map(l => l.trim()) };
    case "code-map": {
      const out: Record<string, string> = {};
      const errors: string[] = [];
      for (const line of lines(text)) {
        const i = line.indexOf(":");
        const code = (i < 0 ? line : line.slice(0, i)).trim();
        const desc = i < 0 ? "" : line.slice(i + 1).trim();
        if (code in out) errors.push(`${code} is listed twice.`);
        out[code] = desc;
      }
      return errors.length ? { ok: false, errors } : { ok: true, value: out };
    }
    case "tag-map": {
      const out: Record<string, string[]> = {};
      const errors: string[] = [];
      for (const line of lines(text)) {
        const i = line.indexOf(":");
        if (i < 0) {
          errors.push(`“${line.trim()}”: write the field, a colon and its tags, e.g. revision: REV, REV_NO.`);
          continue;
        }
        const field = line.slice(0, i).trim();
        if (field in out) errors.push(`${field} is listed twice.`);
        out[field] = line.slice(i + 1).split(",").map(t => t.trim()).filter(Boolean);
      }
      return errors.length ? { ok: false, errors } : { ok: true, value: out };
    }
  }
}
