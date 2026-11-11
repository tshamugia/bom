import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  CHECK_PARAMS, DEFAULT_RULES_YAML, applyParamValues, changedParams, checkParam, crossParamErrors,
  defaultParamValue, effectiveRulesYaml, formatParamText, paramValue, parseParamOverrides, parseParamText,
  validateParamValue,
} from "@/lib/drawing-check-params";
import { pythonRegexError } from "@/lib/python-regex";
import { exportRulesYaml, switchedOffRules } from "@/lib/drawing-check-yaml";
import { parseCheckRulesConfig } from "@/lib/drawing-checks";
import { countRuleChanges, describeRuleChanges, ruleChanges } from "@/lib/drawing-check-settings";

// js-yaml comes with eslint; it is only used here to read yaml back.
const { load } = createRequire(import.meta.url)("js-yaml") as { load: (s: string) => unknown };

const RULES_YAML = path.resolve(__dirname, "../../../services/dxf-checker/app/checker/rules.yaml");
const serviceYaml = () => load(readFileSync(RULES_YAML, "utf8")) as Record<string, unknown>;

const p = (id: string) => checkParam(id)!;

describe("the defaults are the checker's rules.yaml", () => {
  test("same values, key for key", () => {
    expect(JSON.parse(JSON.stringify(DEFAULT_RULES_YAML))).toEqual(serviceYaml());
  });

  test("every editable parameter exists in rules.yaml and validates as shipped", () => {
    for (const param of CHECK_PARAMS) {
      expect(defaultParamValue(param), param.id).not.toBeUndefined();
      expect(validateParamValue(param, defaultParamValue(param)), param.id).toEqual({ ok: true, value: defaultParamValue(param) });
    }
    expect(crossParamErrors({})).toEqual({});
  });

  test("the export of untouched settings reads back as rules.yaml", () => {
    const yaml = exportRulesYaml({ version: 0, exportedAt: new Date("2026-11-11T10:00:00Z"), overrides: {}, rules: parseCheckRulesConfig(null) });
    expect(load(yaml)).toEqual(serviceYaml());
    expect(yaml).toContain("version 0, 2026-11-11");
    expect(yaml).not.toContain("გამორთული წესები");
  });
});

describe("patterns are checked the way Python compiles them", () => {
  test.each([
    String.raw`^\d{2}[A-Z]{3}$`,
    String.raw`(?i)(^|[\s_\-.])final($|[\s_\-.])`,
    String.raw`(?<!\d)20\d{6}(?!\d)`,
    String.raw`\b(?=[A-Z0-9\-./]*[A-Z])(?=(?:[A-Z\-./]*\d){2})[A-Z0-9][A-Z0-9\-./]{4,}\b`,
    String.raw`(?P<code>[A-Z]{2})-(?P=code)`,
    String.raw`\Afoo\Z`,
    String.raw`(?i:abc)def`,
    String.raw`(?<=ab|cd)x`,
    String.raw`a{,3}`,
    "შტამპ",
    String.raw`^A\$C[0-9A-F]+$`,
  ])("accepts %s", pattern => {
    expect(pythonRegexError(pattern)).toBeNull();
  });

  test.each([
    ["(", "Unterminated group"],
    ["[A-Z", "unterminated character set"],
    ["a**", "Nothing to repeat"],
    [String.raw`\q`, String.raw`bad escape \q`],
    [String.raw`\k<x>`, String.raw`bad escape \k`],
    [String.raw`\p{L}`, String.raw`bad escape \p`],
    [String.raw`[\Z]`, String.raw`bad escape \Z`],
    ["abc(?i)", "global flags such as (?i) must be at the very start"],
    ["(?<name>x)", "named groups are written (?P<name>…) in Python"],
    ["(?<=a+)b", "look-behind requires fixed-width pattern"],
    ["(?<!ab|c)x", "look-behind requires fixed-width pattern"],
    [String.raw`\x4`, String.raw`incomplete escape \x`],
    ["x\\", "the pattern ends with a backslash"],
  ])("refuses %s", (pattern, message) => {
    expect(pythonRegexError(pattern)).toBe(message);
  });
});

describe("values", () => {
  test("a pattern that doesn't compile, a bad code or a number out of range isn't valid", () => {
    expect(validateParamValue(p("drafting.sku_generic_pattern"), "(")).toEqual({
      ok: false,
      errors: ["“(” isn't a valid pattern: Unterminated group."],
    });
    expect(validateParamValue(p("naming.zones.patterns"), ["^K[1-9]$", "[A"])).toMatchObject({ ok: false });
    expect(validateParamValue(p("naming.zones.codes"), ["ZZ", "zone", "ZZ"])).toEqual({
      ok: false,
      errors: ["“zone” isn't two capital letters or digits.", "“ZZ” is listed twice."],
    });
    expect(validateParamValue(p("naming.systems"), { FA: "Fire", fire: "" })).toEqual({
      ok: false,
      errors: ["“fire” isn't two capital letters."],
    });
    expect(validateParamValue(p("drafting.insunits_required"), 25)).toEqual({ ok: false, errors: ["The largest value is 24."] });
    expect(validateParamValue(p("drafting.max_paper_layouts"), 1.5)).toEqual({ ok: false, errors: ["Enter a whole number."] });
    expect(validateParamValue(p("titleblock.required"), ["sheet_no", "stamp"])).toMatchObject({ ok: false });
    expect(validateParamValue(p("drafting.legend_layer"), "LEG:END")).toMatchObject({ ok: false });
    // {systems} stands for the system codes in the cable layer pattern.
    expect(validateParamValue(p("drafting.cable_layer_pattern"), "^CBL-{systems}-[A-Z0-9]+$")).toMatchObject({ ok: true });
  });

  test("title block tags are upper-cased and every required field needs one", () => {
    const fields = { ...DEFAULT_RULES_YAML.titleblock.fields, revision: ["rev_x"], scale: [] };
    const checked = validateParamValue(p("titleblock.fields"), fields);
    expect(checked).toMatchObject({ ok: true, value: { revision: ["REV_X"], scale: [] } });
    const overrides = applyParamValues({}, { "titleblock.fields": (checked as { value: Record<string, string[]> }).value });
    expect(crossParamErrors(overrides)).toEqual({ "titleblock.fields": ["Required fields need at least one tag: scale."] });
  });

  test("only what differs from the standard is stored, nested like rules.yaml", () => {
    const zones = p("naming.zones.codes");
    let o = applyParamValues({}, { "naming.zones.codes": ["ZZ", "ST", "XX", "K0"], "drafting.legend_layer": "LEGEND" });
    expect(o).toEqual({ naming: { zones: { codes: ["ZZ", "ST", "XX", "K0"] } } });
    expect(paramValue(o, zones)).toEqual(["ZZ", "ST", "XX", "K0"]);
    expect(paramValue(o, p("naming.zones.patterns"))).toEqual(["^K[1-9]$"]);
    expect(changedParams({}, o).map(x => x.id)).toEqual(["naming.zones.codes"]);

    // Back to the standard's value: the override goes, and with it the empty branches.
    o = applyParamValues(o, { "naming.zones.codes": ["ZZ", "ST", "XX"] });
    expect(o).toEqual({});
  });

  test("stored values are cleaned: unknown, invalid and default ones are dropped", () => {
    expect(parseParamOverrides({
      naming: { zones: { codes: ["K0"], extra: 1 }, systems: { FA: "Fire" }, project_pattern: "(" },
      drafting: { insunits_required: 4, legend_layer: "LEG" },
      surprise: true,
    })).toEqual({ naming: { zones: { codes: ["K0"] }, systems: { FA: "Fire" } }, drafting: { legend_layer: "LEG" } });
    expect(parseParamOverrides(null)).toEqual({});
  });

  test("form text goes both ways", () => {
    const systems = p("naming.systems");
    const text = formatParamText(systems, { FA: "ხანძრის სიგნალიზაცია", CC: "" });
    expect(text).toBe("FA: ხანძრის სიგნალიზაცია\nCC");
    expect(parseParamText(systems, `${text}\n\n  AV : აუდიო: ვიდეო  `)).toEqual({
      ok: true,
      value: { FA: "ხანძრის სიგნალიზაცია", CC: "", AV: "აუდიო: ვიდეო" },
    });
    expect(parseParamText(systems, "FA: a\nFA: b")).toEqual({ ok: false, errors: ["FA is listed twice."] });

    const tags = p("titleblock.fields");
    expect(parseParamText(tags, formatParamText(tags, defaultParamValue(tags)))).toEqual({ ok: true, value: defaultParamValue(tags) });
    expect(parseParamText(tags, "revision REV")).toMatchObject({ ok: false });

    expect(parseParamText(p("naming.zones.codes"), " ZZ \n\nK0\n")).toEqual({ ok: true, value: ["ZZ", "K0"] });
    expect(parseParamText(p("drafting.duplicate_tolerance_mm"), "2,5")).toEqual({ ok: true, value: 2.5 });
    expect(parseParamText(p("drafting.duplicate_tolerance_mm"), "two")).toEqual({ ok: false, errors: ["Enter a number."] });
  });
});

describe("the rules.yaml export", () => {
  test("carries Settings' parameters and severities, and names the rules that are off", () => {
    const overrides = applyParamValues({}, {
      "naming.systems": { FA: "Fire alarm", "XY": "it's new" },
      "drafting.sku_whitelist": ["FP200", "yes"],
      "titleblock.scale_pattern": String.raw`^(1:\d+|NTS)$`,
    });
    const rules = parseCheckRulesConfig({
      disabled: ["D07-SKU"],
      disabledGroups: ["xref"],
      severity: { "D13-CABLE-LAYER-NAME": "INFO", "D15-UNITS": "ERROR" },
    });
    const yaml = exportRulesYaml({ version: 7, exportedAt: new Date("2026-11-11T10:00:00Z"), overrides, rules });
    const back = load(yaml) as typeof DEFAULT_RULES_YAML;

    expect(back.naming.systems).toEqual({ FA: "Fire alarm", XY: "it's new" });
    // "yes" would be a boolean to PyYAML unless quoted.
    expect(yaml).toContain("sku_whitelist:\n    - FP200\n    - 'yes'");
    expect(back.titleblock.scale_pattern).toBe(String.raw`^(1:\d+|NTS)$`);
    // A severity equal to the catalog's isn't an override.
    expect(back.severity_overrides).toEqual({ "D13-CABLE-LAYER-NAME": "INFO" });
    expect(back.naming.series["0"]).toBe(DEFAULT_RULES_YAML.naming.series["0"]);
    expect(switchedOffRules(rules)).toEqual(["D05-XREF-COUNT", "D05-XREF-ABS", "D07-SKU"]);
    expect(yaml).toContain("#   D05-XREF-COUNT, D05-XREF-ABS, D07-SKU");
    expect(effectiveRulesYaml(overrides).drafting.legend_layer).toBe("LEGEND");
  });
});

test("rule changes are described for the audit log", () => {
  const before = parseCheckRulesConfig({ disabled: ["D15-UNITS"] });
  const after = parseCheckRulesConfig({ disabledGroups: ["sku"], disabled: ["D06-DUPLICATE"], severity: { "D13-CABLE-LAYER-NAME": "INFO" } });
  const c = ruleChanges(before, after);
  expect(countRuleChanges(c)).toBe(4);
  expect(describeRuleChanges(c)).toBe("group off: SKU ნახაზზე; off: D06-DUPLICATE; on: D15-UNITS; D13-CABLE-LAYER-NAME WARNING → INFO");
  expect(countRuleChanges(ruleChanges(after, after))).toBe(0);
});
