"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icons";
import {
  createSection,
  listSectionSuggestions,
} from "@/server/actions/bom-sections";

type Props = {
  revisionId: string;
  onCreated: (section: { id: string; name: string; position: number }) => void;
};

export function NewSectionInlineCreate({ revisionId, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const datalistId = "section-suggestions";

  useEffect(() => {
    if (open && suggestions.length === 0) {
      listSectionSuggestions().then(setSuggestions).catch(() => setSuggestions([]));
    }
  }, [open, suggestions.length]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function commit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    start(async () => {
      const created = await createSection({ revisionId, name: trimmed });
      onCreated({ id: created.id, name: created.name, position: created.position });
      setName("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <div className="border-t border-[var(--color-line-soft)] bg-[var(--color-surface-2)] px-3 py-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Icon.Plus size={14} className="mr-1.5" /> New section
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--color-line-soft)] bg-[var(--color-surface-2)] px-3 py-2">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          list={datalistId}
          className="h-8 flex-1 text-[13px]"
          placeholder="Section name (e.g., Fire Alarm, IT Network)"
          value={name}
          maxLength={120}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setName("");
              setOpen(false);
            }
          }}
        />
        <datalist id={datalistId}>
          {suggestions.map(s => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Button size="sm" onClick={commit} disabled={pending || name.trim().length === 0}>
          Add
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setName(""); setOpen(false); }}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
