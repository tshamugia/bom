"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { formatDateTime } from "@/lib/format";
import { TRANSMITTAL_PURPOSES, TRANSMITTAL_PURPOSE_LABEL, type TransmittalPurpose } from "@/lib/drawing-meta";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { acknowledgeTransmittal, issueDrawingTransmittal } from "@/server/actions/drawing-transmittals";
import type { TransmittalRow } from "@/server/queries/drawing-control";
import { SELECT_CLASS, TEXTAREA_CLASS, type UserOption } from "./drawing-form-fields";

function IssueDialog({
  revisionId,
  revisionNumber,
  users,
  currentUserId,
}: {
  revisionId: string;
  revisionNumber: number;
  users: UserOption[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<TransmittalPurpose>("construction");
  const [ids, setIds] = useState<string[]>([]);
  const [external, setExternal] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const rev = formatDrawingRevision(revisionNumber);

  const selected = users.filter(u => ids.includes(u.id));
  const available = users.filter(u => !ids.includes(u.id) && u.id !== currentUserId);
  const hasRecipient = ids.length > 0 || !!external.trim();

  const submit = () => {
    start(async () => {
      const res = await issueDrawingTransmittal({
        revisionId,
        purpose,
        userIds: ids,
        externalName: external.trim() || undefined,
        note: note.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${rev} issued to ${res.count} recipient${res.count === 1 ? "" : "s"}`);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        // Start clean each time — a cancelled draft must not leak into the next issue.
        if (next) {
          setPurpose("construction");
          setIds([]);
          setExternal("");
          setNote("");
        }
      }}
    >
      <DialogTrigger
        render={
          <button type="button" className="btn btn-sm">
            <Icon.Send className="ico" /> Issue {rev}
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue {rev}</DialogTitle>
          <DialogDescription>
            App users are emailed a link and confirm receipt. People without an account are only recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="tx-purpose">Purpose</Label>
            <select id="tx-purpose" className={SELECT_CLASS} value={purpose} onChange={e => setPurpose(e.target.value as TransmittalPurpose)}>
              {TRANSMITTAL_PURPOSES.map(p => <option key={p} value={p}>{TRANSMITTAL_PURPOSE_LABEL[p]}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tx-users">To app users (e.g. the site foreman)</Label>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map(u => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[12.5px]"
                    title={u.email}
                  >
                    {u.name}
                    <button
                      type="button"
                      onClick={() => setIds(prev => prev.filter(id => id !== u.id))}
                      className="text-[var(--color-text-3)] hover:text-[var(--color-text)]"
                      aria-label={`Remove ${u.name}`}
                    >
                      <Icon.X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <select
              id="tx-users"
              className={SELECT_CLASS}
              value=""
              onChange={e => {
                const id = e.target.value;
                if (id) setIds(prev => [...prev, id]);
              }}
              disabled={available.length === 0}
            >
              <option value="">{available.length ? "Add a user…" : "Everyone is already added"}</option>
              {available.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tx-external">Or someone without an account</Label>
            <Input
              id="tx-external"
              value={external}
              maxLength={200}
              onChange={e => setExternal(e.target.value)}
              placeholder="e.g. Client — Hilton Tbilisi, M. Beridze"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tx-note">Note (optional)</Label>
            <textarea
              id="tx-note"
              className={TEXTAREA_CLASS}
              value={note}
              maxLength={2000}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Sent by email as PDF, printed copy handed over on site"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !hasRecipient}>{pending ? "Issuing…" : `Issue ${rev}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcknowledgeButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await acknowledgeTransmittal({ id });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Receipt acknowledged");
          router.refresh();
        })
      }
    >
      <Icon.Check className="ico" /> Acknowledge
    </button>
  );
}

export function TransmittalsCard({
  transmittals,
  latestRevisionId,
  latestRevisionNumber,
  users,
  currentUserId,
  readOnly = false,
}: {
  transmittals: TransmittalRow[];
  latestRevisionId: string;
  latestRevisionNumber: number;
  users: UserOption[];
  currentUserId: string;
  /** Viewers can't issue, but still acknowledge transmittals sent to them. */
  readOnly?: boolean;
}) {
  const mine = transmittals.filter(
    t => t.recipientUserId === currentUserId && !t.acknowledgedAt && t.revisionNumber === latestRevisionNumber,
  );

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">Transmittals</h3>
          <p className="card-sub">Who received which revision, and whether it is still current.</p>
        </div>
        <span className="spacer" />
        {!readOnly && (
          <IssueDialog
            revisionId={latestRevisionId}
            revisionNumber={latestRevisionNumber}
            users={users}
            currentUserId={currentUserId}
          />
        )}
      </div>
      {mine.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ background: "var(--accent-soft)", borderBottom: "1px solid var(--line-soft)" }}>
          <Icon.Bell size={14} />
          <span className="text-[12.5px]">
            {mine.map(t => formatDrawingRevision(t.revisionNumber)).join(", ")} was issued to you — confirm you received it.
          </span>
        </div>
      )}
      {transmittals.length === 0 ? (
        <div className="muted px-4 py-3 text-[12.5px]">Not issued to anyone yet.</div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 320 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Rev</th>
                <th>To</th>
                <th>Purpose</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {transmittals.map(t => {
                const superseded = t.revisionNumber < latestRevisionNumber;
                return (
                  <tr key={t.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className="mono">{formatDrawingRevision(t.revisionNumber)}</span>
                      {superseded && (
                        <div style={{ marginTop: 2 }}>
                          <Badge tone="danger">Superseded by {formatDrawingRevision(latestRevisionNumber)}</Badge>
                        </div>
                      )}
                    </td>
                    <td>
                      {t.recipientName ?? t.externalName ?? "—"}
                      {!t.recipientUserId && <span className="muted"> · no account</span>}
                      <div className="muted" style={{ fontSize: 11 }}>
                        {formatDateTime(t.createdAt)} · by {t.sentByName ?? "—"}
                      </div>
                      {t.note && <div className="muted whitespace-pre-line" style={{ fontSize: 11.5 }}>{t.note}</div>}
                    </td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{TRANSMITTAL_PURPOSE_LABEL[t.purpose]}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {t.acknowledgedAt ? (
                        <>
                          <Badge tone="success">Received</Badge>
                          <div className="muted" style={{ fontSize: 11 }}>{formatDateTime(t.acknowledgedAt)}</div>
                        </>
                      ) : !t.recipientUserId ? (
                        <span className="muted">Recorded</span>
                      ) : t.recipientUserId === currentUserId && !superseded ? (
                        <AcknowledgeButton id={t.id} />
                      ) : (
                        <Badge tone="warning">Pending</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
