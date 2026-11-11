// What changed between two versions of the DXF check rules (issue #18,
// stage 3) — for the audit row and the save button. Client-safe.

import { CHECK_RULE_GROUPS, checkRule, type CheckSeverity } from "./drawing-check-rules";
import type { CheckRulesConfig } from "./drawing-checks";

export type RuleChanges = {
  groupsOff: string[];
  groupsOn: string[];
  rulesOff: string[];
  rulesOn: string[];
  severity: Array<{ id: string; from: CheckSeverity; to: CheckSeverity }>;
};

const severityOf = (cfg: CheckRulesConfig, id: string): CheckSeverity => cfg.severity[id] ?? checkRule(id)!.severity;

export function ruleChanges(before: CheckRulesConfig, after: CheckRulesConfig): RuleChanges {
  const out: RuleChanges = { groupsOff: [], groupsOn: [], rulesOff: [], rulesOn: [], severity: [] };
  for (const g of CHECK_RULE_GROUPS) {
    const wasOff = before.disabledGroups.includes(g.id);
    const isOff = after.disabledGroups.includes(g.id);
    if (!wasOff && isOff) out.groupsOff.push(g.id);
    if (wasOff && !isOff) out.groupsOn.push(g.id);
    for (const r of g.rules) {
      const was = before.disabled.includes(r.id);
      const is = after.disabled.includes(r.id);
      if (!was && is) out.rulesOff.push(r.id);
      if (was && !is) out.rulesOn.push(r.id);
      const from = severityOf(before, r.id);
      const to = severityOf(after, r.id);
      if (from !== to) out.severity.push({ id: r.id, from, to });
    }
  }
  return out;
}

export function countRuleChanges(c: RuleChanges): number {
  return c.groupsOff.length + c.groupsOn.length + c.rulesOff.length + c.rulesOn.length + c.severity.length;
}

const groupLabel = (id: string) => CHECK_RULE_GROUPS.find(g => g.id === id)?.label ?? id;

/** "groups off: SKU ნახაზზე; rules off: D07-SKU; D13-CABLE-LAYER-NAME WARNING → INFO" */
export function describeRuleChanges(c: RuleChanges): string {
  const parts = [
    c.groupsOff.length ? `group${c.groupsOff.length === 1 ? "" : "s"} off: ${c.groupsOff.map(groupLabel).join(", ")}` : null,
    c.groupsOn.length ? `group${c.groupsOn.length === 1 ? "" : "s"} on: ${c.groupsOn.map(groupLabel).join(", ")}` : null,
    c.rulesOff.length ? `off: ${c.rulesOff.join(", ")}` : null,
    c.rulesOn.length ? `on: ${c.rulesOn.join(", ")}` : null,
    ...c.severity.map(s => `${s.id} ${s.from} → ${s.to}`),
  ].filter(Boolean);
  return parts.join("; ");
}
