"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProject } from "@/server/actions/projects";

type Props = {
  projectId: string;
  initialName: string;
};

export function InlineProjectName({ projectId, initialName }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [name, setName] = useState(initialName);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const next = value.trim();
    if (!next) {
      setValue(name);
      setEditing(false);
      return;
    }
    if (next === name) {
      setEditing(false);
      return;
    }
    const previous = name;
    setName(next);
    setEditing(false);
    start(async () => {
      try {
        await updateProject({ id: projectId, name: next });
        toast.success("Project renamed");
      } catch (e) {
        setName(previous);
        setValue(previous);
        toast.error(e instanceof Error ? e.message : "Rename failed");
      }
    });
  }

  function cancel() {
    setValue(name);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1 rounded text-left text-[20px] font-semibold tracking-tight transition-colors hover:text-[var(--color-text-2)]"
        title="Click to rename"
      >
        <span>{name}</span>
        {pending && (
          <span className="text-[11px] font-normal text-[var(--color-text-3)]">saving…</span>
        )}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      className="rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[20px] font-semibold tracking-tight text-[var(--color-text)] outline-none focus:border-[var(--color-cat-indigo)] focus:ring-2 focus:ring-[var(--color-cat-indigo)]/20"
      maxLength={200}
    />
  );
}
