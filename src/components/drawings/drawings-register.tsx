"use client";

import { useRef, useState } from "react";
import type { BulkDrawing } from "@/lib/drawing-bulk";
import { DrawingsTable, type DrawingTableRow } from "./drawings-table";
import { BulkDrawingBar } from "./bulk-edit-dialogs";
import type { UserOption } from "./drawing-form-fields";

export type RegisterRow = DrawingTableRow & BulkDrawing;

/**
 * The /drawings list for editors: tick drawings (shift-click ticks a range),
 * then change their status, owner or due date together from the bar under the
 * table. The page remounts it when the filters change, which clears the ticks.
 */
export function DrawingsRegister({
  rows,
  today,
  emptyText,
  users,
  currentUserId,
}: {
  rows: RegisterRow[];
  today: string;
  emptyText: string;
  users: UserOption[];
  currentUserId: string;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  // A drawing whose status moved it out of the current tab drops out here.
  const chosen = rows.filter(r => selected.has(r.id));

  const toggle = (id: string, checked: boolean, range: boolean) => {
    const at = rows.findIndex(r => r.id === id);
    const from = range && anchor.current ? rows.findIndex(r => r.id === anchor.current) : -1;
    const ids = from >= 0 && at >= 0
      ? rows.slice(Math.min(from, at), Math.max(from, at) + 1).map(r => r.id)
      : [id];
    anchor.current = id;
    setSelected(prev => {
      const next = new Set(prev);
      for (const x of ids) {
        if (checked) next.add(x);
        else next.delete(x);
      }
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    anchor.current = null;
    setSelected(checked ? new Set(rows.map(r => r.id)) : new Set());
  };

  return (
    <>
      <DrawingsTable
        rows={rows}
        today={today}
        emptyText={emptyText}
        selection={{ selected, onToggle: toggle, onToggleAll: toggleAll }}
      />
      {chosen.length > 0 && (
        <BulkDrawingBar
          rows={chosen}
          users={users}
          currentUserId={currentUserId}
          onDone={updated => {
            const done = new Set(updated);
            setSelected(prev => new Set([...prev].filter(id => !done.has(id))));
          }}
          onClear={() => toggleAll(false)}
        />
      )}
    </>
  );
}
