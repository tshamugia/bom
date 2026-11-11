"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { CHECK_RULE_GROUPS, CHECK_SEVERITIES, type CheckSeverity } from "@/lib/drawing-check-rules";
import { CHECK_SEVERITY_LABEL, parseCheckRulesConfig, type CheckRulesConfig } from "@/lib/drawing-checks";
import { countRuleChanges, ruleChanges } from "@/lib/drawing-check-settings";
import { saveDrawingCheckRules } from "@/server/actions/drawing-check-settings";
import { SELECT_CLASS } from "../drawing-form-fields";

const toggle = (list: string[], id: string, on: boolean) => (on ? list.filter(x => x !== id) : [...list, id]);

/**
 * The 60 rules in their 12 groups: a switch per group and per rule, and the
 * severity of each (Error and To check become remarks, Info stays in the
 * report). Changes collect in a bar at the bottom and save as one new version.
 */
export function CheckRulesForm({ version, initial }: { version: number; initial: CheckRulesConfig }) {
  const [disabled, setDisabled] = useState(initial.disabled);
  const [disabledGroups, setDisabledGroups] = useState(initial.disabledGroups);
  const [severity, setSeverity] = useState(initial.severity);
  const [pending, start] = useTransition();
  const router = useRouter();

  const current = useMemo(() => parseCheckRulesConfig({ disabled, disabledGroups, severity }), [disabled, disabledGroups, severity]);
  const changes = countRuleChanges(ruleChanges(initial, current));

  const discard = () => {
    setDisabled(initial.disabled);
    setDisabledGroups(initial.disabledGroups);
    setSeverity(initial.severity);
  };

  const save = () =>
    start(async () => {
      const res = await saveDrawingCheckRules({ baseVersion: version, ...current });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Rules saved — settings v${res.version}`);
      router.refresh();
    });

  const setRuleSeverity = (id: string, def: CheckSeverity, value: CheckSeverity) => {
    const next = { ...severity };
    if (value === def) delete next[id];
    else next[id] = value;
    setSeverity(next);
  };

  return (
    <div>
      <div className="grid">
        {CHECK_RULE_GROUPS.map(g => {
          const groupOn = !disabledGroups.includes(g.id);
          const on = g.rules.filter(r => !disabled.includes(r.id)).length;
          return (
            <div key={g.id} className="px-4 py-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={groupOn}
                  onChange={e => setDisabledGroups(toggle(disabledGroups, g.id, e.target.checked))}
                  aria-label={`Check ${g.label}`}
                />
                <span className="min-w-0 flex-1 text-[13.5px] font-medium">{g.label}</span>
                <span className="muted text-[12px] tabular-nums">{groupOn ? `${on} of ${g.rules.length} on` : "Off"}</span>
              </label>
              <details className="mt-1">
                <summary className="cursor-pointer text-[12.5px] text-[var(--color-text-2)]">
                  {g.rules.length} rule{g.rules.length === 1 ? "" : "s"}
                </summary>
                {!groupOn && <p className="muted m-0 mt-1 text-[12px]">The group is off: none of its rules run, whatever they are set to.</p>}
                <ul className="m-0 mt-1 list-none p-0" style={{ opacity: groupOn ? 1 : 0.6 }}>
                  {g.rules.map(r => {
                    const ruleOn = !disabled.includes(r.id);
                    const sev = severity[r.id] ?? r.severity;
                    return (
                      <li key={r.id} className="flex flex-wrap items-start gap-x-2 gap-y-1.5 py-2" style={{ borderTop: "1px solid var(--line-soft)" }}>
                        <label className="flex min-w-0 flex-[1_1_220px] cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={ruleOn}
                            onChange={e => setDisabled(toggle(disabled, r.id, e.target.checked))}
                            aria-label={`Run ${r.id}`}
                          />
                          <span className="grid min-w-0 gap-0.5">
                            <span className="flex flex-wrap items-center gap-x-2">
                              <span className="mono text-[11.5px]">{r.id}</span>
                              <span className="muted text-[11.5px]">{r.ref}</span>
                            </span>
                            <span className="text-[13px] [overflow-wrap:anywhere]">{r.title}</span>
                          </span>
                        </label>
                        <select
                          className={`${SELECT_CLASS} ml-6 !w-[150px] shrink-0 min-[701px]:ml-0`}
                          value={sev}
                          onChange={e => setRuleSeverity(r.id, r.severity, e.target.value as CheckSeverity)}
                          aria-label={`Severity of ${r.id}`}
                          disabled={!ruleOn}
                        >
                          {CHECK_SEVERITIES.map(s => (
                            <option key={s} value={s}>
                              {CHECK_SEVERITY_LABEL[s]}{s === r.severity ? " (standard)" : ""}
                            </option>
                          ))}
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </div>
          );
        })}
      </div>
      {changes > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count"><strong>{changes}</strong> unsaved change{changes === 1 ? "" : "s"}</span>
          <div className="bulk-actions">
            <Button variant="outline" onClick={discard} disabled={pending}>Discard</Button>
            <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save rules"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
