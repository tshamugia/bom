"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { setDrawingRecipients } from "@/server/actions/drawing-settings";
import { setReminderRecipients } from "@/server/actions/drawing-reminders";
import { SELECT_CLASS, type UserOption } from "./drawing-form-fields";

export function RecipientsForm({
  projectId,
  users,
  initialIds,
  list = "status",
  readOnly = false,
}: {
  /** `null` edits the list notified about every project. */
  projectId: string | null;
  users: UserOption[];
  initialIds: string[];
  /** Status-change emails, or the managers who get the daily reminder digest. */
  list?: "status" | "reminders";
  readOnly?: boolean;
}) {
  // Disabled users never get mail, so they are dropped from the editable list.
  const known = new Set(users.map(u => u.id));
  const baseline = initialIds.filter(id => known.has(id));
  const [ids, setIds] = useState(baseline);
  const [pending, start] = useTransition();
  const router = useRouter();

  const selected = users.filter(u => ids.includes(u.id));
  const available = users.filter(u => !ids.includes(u.id));
  const dirty = ids.length !== baseline.length || ids.some(id => !baseline.includes(id));

  const save = () => {
    start(async () => {
      const persist = list === "reminders" ? setReminderRecipients : setDrawingRecipients;
      const res = await persist({ projectId, userIds: ids });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(list === "reminders" ? "Reminder recipients saved" : "Notification recipients saved");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5">
        {selected.map(u => (
          <span
            key={u.id}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[12.5px]"
            title={u.email}
          >
            {u.name}
            {!readOnly && (
              <button
                type="button"
                onClick={() => setIds(prev => prev.filter(id => id !== u.id))}
                className="text-[var(--color-text-3)] hover:text-[var(--color-text)]"
                aria-label={`Remove ${u.name}`}
              >
                <Icon.X size={12} />
              </button>
            )}
          </span>
        ))}
        {selected.length === 0 && (
          <span className="text-[12.5px] text-[var(--color-text-3)]">No extra recipients.</span>
        )}
      </div>
      {!readOnly && (
        <div className="flex gap-2">
          <select
            className={SELECT_CLASS}
            value=""
            onChange={e => {
              const id = e.target.value;
              if (id) setIds(prev => [...prev, id]);
            }}
            disabled={available.length === 0}
          >
            <option value="">{available.length ? "Add a user…" : "Everyone is already added"}</option>
            {available.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
