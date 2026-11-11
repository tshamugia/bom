"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CHECK_PARAMS, defaultParamValue, formatParamText, parseParamText, sameParamValue, validateParamValue,
  type CheckParam, type CheckParamSectionId, type ParamValue,
} from "@/lib/drawing-check-params";
import { saveDrawingCheckParams } from "@/server/actions/drawing-check-settings";
import { TEXTAREA_CLASS } from "../drawing-form-fields";

const SINGLE_LINE = new Set(["regex", "text", "int", "number"]);
const INPUT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px]";

/** What the admin typed, as the value it would save — or why it can't be saved. */
function check(p: CheckParam, text: string): { value?: ParamValue; errors: string[] } {
  const parsed = parseParamText(p, text);
  if (!parsed.ok) return { errors: parsed.errors };
  const v = validateParamValue(p, parsed.value);
  return v.ok ? { value: v.value, errors: [] } : { errors: v.errors };
}

function ParamField({
  p,
  text,
  errors,
  onChange,
}: {
  p: CheckParam;
  text: string;
  errors: string[];
  onChange: (text: string) => void;
}) {
  const parsed = check(p, text);
  const def = defaultParamValue(p);
  const isDefault = parsed.value !== undefined && sameParamValue(parsed.value, def);
  const rows = Math.min(Math.max(text.split("\n").length + 1, 3), 14);
  const id = `param-${p.id}`;
  const shown = errors.length ? errors : parsed.errors;

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-[13px] font-medium">{p.label}</label>
        {!isDefault && parsed.value !== undefined && <Badge tone="info">Changed</Badge>}
      </div>
      <p className="muted m-0 text-[12px]">
        {p.hint}
        {p.rules.length > 0 && (
          <> Used by <span className="mono [overflow-wrap:anywhere]">{p.rules.join(", ")}</span>.</>
        )}
      </p>
      {SINGLE_LINE.has(p.kind) ? (
        <input
          id={id}
          className={`${INPUT_CLASS} ${p.kind === "regex" ? "mono" : ""}`}
          value={text}
          inputMode={p.kind === "int" || p.kind === "number" ? "decimal" : undefined}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
          aria-invalid={shown.length > 0}
        />
      ) : (
        <textarea
          id={id}
          className={`${TEXTAREA_CLASS} mono text-[12px]`}
          value={text}
          rows={rows}
          wrap="off"
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
          aria-invalid={shown.length > 0}
        />
      )}
      {shown.map(e => (
        <p key={e} className="m-0 text-[12px] [overflow-wrap:anywhere]" style={{ color: "var(--red)" }}>{e}</p>
      ))}
      {!isDefault && (
        <div>
          <button type="button" className="text-[12px] text-[var(--color-text-2)] underline" onClick={() => onChange(formatParamText(p, def))}>
            Use the standard&apos;s value
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One section of rules.yaml parameters. Every field is checked as it is typed
 * (patterns the way Python compiles them); the server checks again — and asks
 * the checker when it is connected — and stores nothing unless all pass.
 */
export function CheckParamsForm({
  section,
  version,
  values,
}: {
  section: CheckParamSectionId;
  version: number;
  /** Effective value of each parameter in this section. */
  values: Record<string, ParamValue>;
}) {
  const params = CHECK_PARAMS.filter(p => p.section === section);
  const initial = Object.fromEntries(params.map(p => [p.id, formatParamText(p, values[p.id] ?? defaultParamValue(p))]));
  const [texts, setTexts] = useState<Record<string, string>>(initial);
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const dirty = params.filter(p => texts[p.id] !== initial[p.id]);
  const checked = Object.fromEntries(dirty.map(p => [p.id, check(p, texts[p.id])]));
  const invalid = dirty.some(p => checked[p.id].errors.length > 0);

  const change = (id: string, text: string) => {
    setTexts({ ...texts, [id]: text });
    if (serverErrors[id]) setServerErrors({ ...serverErrors, [id]: [] });
  };

  const save = () =>
    start(async () => {
      const res = await saveDrawingCheckParams({
        baseVersion: version,
        values: Object.fromEntries(dirty.map(p => [p.id, checked[p.id].value])),
      });
      if (!res.ok) {
        setServerErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      setServerErrors({});
      toast.success(`Saved — settings v${res.version}`);
      router.refresh();
    });

  return (
    <div className="grid gap-4 p-4">
      {params.map(p => (
        <ParamField key={p.id} p={p} text={texts[p.id]} errors={serverErrors[p.id] ?? []} onChange={t => change(p.id, t)} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={pending || !dirty.length || invalid}>{pending ? "Saving…" : "Save"}</Button>
        {dirty.length > 0 && (
          <Button variant="outline" onClick={() => { setTexts(initial); setServerErrors({}); }} disabled={pending}>Discard</Button>
        )}
        {invalid && <span className="text-[12px]" style={{ color: "var(--red)" }}>Fix the values marked in red to save.</span>}
      </div>
    </div>
  );
}
