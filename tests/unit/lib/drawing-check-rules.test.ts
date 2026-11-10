import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { CHECK_RULE_GROUPS, CHECK_RULE_IDS, CHECK_RULES } from "@/lib/drawing-check-rules";

// The app sends the enabled rule ids with every check and treats "enabled and
// not reported" as passed, so its list must match the service's exactly.
const COMMON_PY = path.resolve(__dirname, "../../../services/dxf-checker/app/checker/common.py");

function serviceCatalog() {
  const src = readFileSync(COMMON_PY, "utf8");
  const rules = new Map<string, { severity: string; ref: string; title: string }>();
  for (const m of src.matchAll(/^\s+"([A-Z0-9-]+)": \((ERROR|WARNING|INFO), "([^"]*)", "([^"]*)"\),\r?$/gm)) {
    rules.set(m[1], { severity: m[2], ref: m[3], title: m[4] });
  }
  const groupsSrc = src.slice(src.indexOf("GROUPS: list"), src.indexOf("RULE_GROUP ="));
  const groups = [...groupsSrc.matchAll(/\("([a-z-]+)", "([^"]+)", \[([^\]]+)\]\)/g)].map(m => ({
    id: m[1],
    label: m[2],
    rules: [...m[3].matchAll(/"([A-Z0-9-]+)"/g)].map(x => x[1]),
  }));
  return { rules, groups };
}

test("the app's rule catalog is the dxf-checker's: same groups, ids, severities, references and titles", () => {
  const svc = serviceCatalog();
  expect(svc.rules.size).toBe(60);
  expect(CHECK_RULE_GROUPS.map(g => ({ id: g.id, label: g.label, rules: g.rules.map(r => r.id) }))).toEqual(svc.groups);
  for (const r of CHECK_RULES) {
    expect({ id: r.id, ...svc.rules.get(r.id) }).toEqual({ id: r.id, severity: r.severity, ref: r.ref, title: r.title });
  }
  expect(new Set(CHECK_RULE_IDS).size).toBe(CHECK_RULE_IDS.length);
  expect([...svc.rules.keys()].sort()).toEqual([...CHECK_RULE_IDS].sort());
});
