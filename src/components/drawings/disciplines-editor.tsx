"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icons";
import { createDiscipline, deleteDiscipline, renameDiscipline } from "@/server/actions/drawing-settings";

type Discipline = { id: string; name: string; drawingCount: number };

function DisciplineRow({ d }: { d: Discipline }) {
  const [name, setName] = useState(d.name);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = name.trim() !== d.name && name.trim().length > 0;

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(done);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2 max-[701px]:flex-wrap">
      <Input value={name} onChange={e => setName(e.target.value)} maxLength={60} className="max-[701px]:basis-full" />
      <span className="w-24 shrink-0 text-right text-[12px] text-[var(--color-text-3)] max-[701px]:mr-auto max-[701px]:w-auto max-[701px]:text-left">
        {d.drawingCount} drawing{d.drawingCount === 1 ? "" : "s"}
      </span>
      <Button
        variant="outline"
        disabled={pending || !dirty}
        onClick={() => run(() => renameDiscipline({ id: d.id, name: name.trim() }), "Discipline renamed")}
      >
        Rename
      </Button>
      <Button
        variant="ghost"
        disabled={pending}
        aria-label={`Remove ${d.name}`}
        onClick={() => {
          const note = d.drawingCount > 0 ? ` ${d.drawingCount} drawing(s) will be left without a discipline.` : "";
          if (!confirm(`Remove discipline ${d.name}?${note}`)) return;
          run(() => deleteDiscipline({ id: d.id }), "Discipline removed");
        }}
      >
        <Icon.Trash size={14} />
      </Button>
    </div>
  );
}

export function DisciplinesEditor({ disciplines }: { disciplines: Discipline[] }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const add = () => {
    start(async () => {
      const res = await createDiscipline({ name: name.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setName("");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-2 max-[701px]:gap-4">
      {disciplines.map(d => <DisciplineRow key={`${d.id}:${d.name}`} d={d} />)}
      <div className="mt-2 flex gap-2">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={60}
          placeholder="New discipline, e.g. Intercom"
          onKeyDown={e => {
            if (e.key === "Enter" && name.trim() && !pending) {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="outline" disabled={pending || !name.trim()} onClick={add}>
          <Icon.Plus size={14} className="mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}
