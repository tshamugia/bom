"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ReminderConfig } from "@/lib/drawing-reminders";
import { saveReminderConfig, sendRemindersNow } from "@/server/actions/drawing-reminders";
import { SELECT_CLASS } from "./drawing-form-fields";

type RuleKey = "overdue" | "dueSoon" | "review" | "remarks" | "transmittals";

const RULES: Array<{
  key: RuleKey;
  title: string;
  days?: string;
  to: Array<{ field: string; label: string }>;
}> = [
  { key: "overdue", title: "Overdue drawings", to: [{ field: "owner", label: "Owner" }, { field: "managers", label: "Managers" }] },
  {
    key: "dueSoon",
    title: "Due soon",
    days: "days before the due date",
    to: [{ field: "owner", label: "Owner" }, { field: "managers", label: "Managers" }],
  },
  {
    key: "review",
    title: "Waiting for internal approval",
    days: "days waiting",
    to: [
      { field: "reviewer", label: "Approving engineer" },
      { field: "owner", label: "Owner" },
      { field: "managers", label: "Managers" },
    ],
  },
  {
    key: "remarks",
    title: "Open remarks",
    days: "days open",
    to: [{ field: "owner", label: "Owner" }, { field: "managers", label: "Managers" }],
  },
  {
    key: "transmittals",
    title: "Transmittals not acknowledged",
    days: "days after issue",
    to: [{ field: "recipient", label: "Recipient" }, { field: "sender", label: "Sender" }],
  },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function ReminderSettingsForm({
  initial,
  lastRun,
  canEdit,
}: {
  initial: ReminderConfig;
  lastRun: string | null;
  canEdit: boolean;
}) {
  const [config, setConfig] = useState<ReminderConfig>(initial);
  const [confirmSend, setConfirmSend] = useState(false);
  const [saving, startSave] = useTransition();
  const [sending, startSend] = useTransition();
  const router = useRouter();
  const dirty = JSON.stringify(config) !== JSON.stringify(initial);

  const setRule = (key: RuleKey, field: string, value: boolean | number) =>
    setConfig(c => ({ ...c, [key]: { ...c[key], [field]: value } }));

  const save = () =>
    startSave(async () => {
      const res = await saveReminderConfig(config);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Reminder settings saved");
      router.refresh();
    });

  const send = () =>
    startSend(async () => {
      setConfirmSend(false);
      const res = await sendRemindersNow();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.failed > 0) toast.error(`${res.failed} email${res.failed === 1 ? "" : "s"} failed — see History.`);
      toast.success(
        res.recipients === 0
          ? "Nothing to remind anyone about today."
          : `Sent ${res.items} reminder${res.items === 1 ? "" : "s"} to ${res.recipients} ${res.recipients === 1 ? "person" : "people"}.`,
      );
    });

  return (
    <fieldset disabled={!canEdit} className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" checked={config.enabled} onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))} />
          Send a daily reminder email
        </label>
        <label className="flex items-center gap-2">
          at
          <select
            className={SELECT_CLASS}
            style={{ width: 90 }}
            value={config.hour}
            onChange={e => setConfig(c => ({ ...c, hour: Number(e.target.value) }))}
          >
            {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
          </select>
          <span className="muted">Tbilisi time</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={config.weekdaysOnly} onChange={e => setConfig(c => ({ ...c, weekdaysOnly: e.target.checked }))} />
          Weekdays only
        </label>
      </div>

      <div className="table-wrap rounded-md border border-[var(--color-line)]">
        <table className="tbl">
          <thead>
            <tr>
              <th>Remind about</th>
              <th>When</th>
              <th>Send to</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map(rule => {
              const r = config[rule.key] as Record<string, boolean | number>;
              return (
                <tr key={rule.key} style={r.enabled ? undefined : { opacity: 0.55 }}>
                  <td>
                    <label className="flex items-center gap-2 font-medium">
                      <input type="checkbox" checked={!!r.enabled} onChange={e => setRule(rule.key, "enabled", e.target.checked)} />
                      {rule.title}
                    </label>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {rule.days ? (
                      <label className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={90}
                          className="input"
                          style={{ width: 64 }}
                          value={Number(r.days)}
                          onChange={e => setRule(rule.key, "days", Math.max(0, Math.min(90, Math.round(Number(e.target.value) || 0))))}
                        />
                        <span className="muted">{rule.days}</span>
                      </label>
                    ) : (
                      <span className="muted">Every day while overdue</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {rule.to.map(t => (
                        <label key={t.field} className="flex items-center gap-1.5">
                          <input type="checkbox" checked={!!r[t.field]} onChange={e => setRule(rule.key, t.field, e.target.checked)} />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="muted m-0 text-[12px]">
        Everyone gets at most one email a day with all their items. “Managers” are the people listed below (all projects)
        and on each project page. {lastRun ? `Last scheduled run: ${lastRun}.` : "It has not run on a schedule yet."}
      </p>

      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {confirmSend ? (
            <>
              <span className="text-[12.5px]">Email today’s reminders to everyone now?</span>
              <Button variant="outline" onClick={() => setConfirmSend(false)} disabled={sending}>Cancel</Button>
              <Button variant="outline" onClick={send} disabled={sending}>{sending ? "Sending…" : "Yes, send"}</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setConfirmSend(true)} disabled={sending || dirty}>
              Send now
            </Button>
          )}
          <Button onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      ) : (
        <p className="muted m-0 text-[12px]">Only owners and admins can change reminder settings.</p>
      )}
    </fieldset>
  );
}
