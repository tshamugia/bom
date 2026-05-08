"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { updateProcurementSettings } from "@/server/actions/system-settings";
import type { ProcurementSettings } from "@/server/queries/system-settings";

const TEMPLATE_VARS = ["{projectCode}", "{projectName}", "{bomName}", "{revLetter}", "{requesterName}"];

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function EmailListEditor(props: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (!isValidEmail(v)) {
      toast.error("Not a valid email address");
      return;
    }
    if (props.values.includes(v)) {
      setDraft("");
      return;
    }
    props.onChange([...props.values, v]);
    setDraft("");
  }

  function remove(idx: number) {
    props.onChange(props.values.filter((_, i) => i !== idx));
  }

  return (
    <div className="grid gap-1.5">
      <Label>{props.label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {props.values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[12.5px] text-[var(--color-text)]"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-[var(--color-text-3)] hover:text-[var(--color-text)]"
              aria-label={`Remove ${v}`}
            >
              <Icon.X size={12} />
            </button>
          </span>
        ))}
        {props.values.length === 0 && (
          <span className="text-[12.5px] text-[var(--color-text-3)]">No recipients yet.</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={props.placeholder}
        />
        <Button type="button" variant="outline" onClick={add}>
          <Icon.Plus size={14} className="mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

export function ProcurementSettingsForm({ initial }: { initial: ProcurementSettings }) {
  const [to, setTo] = useState<string[]>(initial.to);
  const [cc, setCc] = useState<string[]>(initial.cc);
  const [subject, setSubject] = useState<string>(initial.subject ?? "");
  const [body, setBody] = useState<string>(initial.body ?? "");
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (to.length === 0) {
      toast.error("At least one TO recipient is required");
      return;
    }
    start(async () => {
      try {
        await updateProcurementSettings({
          to,
          cc,
          subject: subject.trim() || null,
          body: body.trim() || null,
        });
        toast.success("Procurement settings saved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid max-w-2xl gap-5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]"
    >
      <EmailListEditor
        label="TO recipients"
        values={to}
        onChange={setTo}
        placeholder="procurement@example.com"
      />

      <EmailListEditor
        label="CC recipients (optional)"
        values={cc}
        onChange={setCc}
        placeholder="manager@example.com"
      />

      <div className="grid gap-1.5">
        <Label htmlFor="subject">Subject template (optional)</Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="BOM for procurement: {projectCode}"
        />
        <p className="text-[12px] text-[var(--color-text-3)]">
          Available variables: {TEMPLATE_VARS.join(", ")}
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="body">Body template (optional)</Label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder="Hi, please find the BOM for {projectCode} ({bomName} Rev {revLetter}) attached..."
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
