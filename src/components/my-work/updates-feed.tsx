"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { MyWorkUpdate, UpdateKind } from "@/lib/my-work";
import { markMyWorkSeen } from "@/server/actions/my-work";

const KIND_LOOK: Record<UpdateKind, { icon: IconName; tone: string }> = {
  "comment": { icon: "Comment", tone: "tone-accent" },
  "status": { icon: "Activity", tone: "tone-amber" },
  "updated": { icon: "Edit", tone: "" },
  "created": { icon: "Plus", tone: "" },
  "file": { icon: "Doc", tone: "" },
  "remark": { icon: "Flag", tone: "tone-pink" },
  "remark-resolved": { icon: "CheckCircle", tone: "tone-green" },
  "transmittal": { icon: "Send", tone: "tone-accent" },
  "bom-status": { icon: "CheckCircle", tone: "tone-green" },
  "bom-owner": { icon: "Branch", tone: "tone-accent" },
};

/** Shown before "Show all". */
const FIRST_PAGE = 12;

/**
 * The updates list on My work. Opening it marks everything seen (the bell
 * drops them), but the "New" tags the user arrived with stay for this visit.
 */
export function UpdatesFeed({ updates, since }: { updates: MyWorkUpdate[]; since: Date }) {
  const [newAfter] = useState(() => new Date(since).getTime());
  const [showAll, setShowAll] = useState(false);
  const isNew = (u: MyWorkUpdate) => new Date(u.at).getTime() > newAfter;
  const fresh = updates.filter(isNew).length;

  useEffect(() => {
    if (fresh > 0) void markMyWorkSeen();
  }, [fresh]);

  if (updates.length === 0) {
    return <div className="card-empty">No updates on your work in the last 30 days.</div>;
  }

  const shown = showAll ? updates : updates.slice(0, Math.max(FIRST_PAGE, fresh));
  return (
    <>
      <ul className="ilist">
        {shown.map(u => {
          const look = KIND_LOOK[u.kind];
          const I = Icon[look.icon];
          const bom = u.kind === "bom-status" || u.kind === "bom-owner";
          const unseen = isNew(u);
          return (
            <li key={u.id}>
              <Link href={u.href} className={`irow ${unseen ? "mw-new-row" : ""}`}>
                <span className={`irow-ico ${look.tone}`}><I className="ico" /></span>
                <div className="irow-body">
                  <div className="irow-title">
                    {u.actorName} <span className="mw-plain">{u.verb}</span>{" "}
                    <span className={bom ? undefined : "mw-nowrap"}>
                      <span className={bom ? undefined : "mono"}>{u.subject}</span> <span className="mono muted">{u.subjectRev}</span>
                    </span>
                  </div>
                  {u.body && <div className="irow-text mw-body">{u.body}</div>}
                  <div className="irow-meta">
                    {unseen && <span className="mw-new">New</span>}
                    <span>{u.context}</span>
                    <time dateTime={new Date(u.at).toISOString()} title={formatDateTime(u.at)} suppressHydrationWarning>
                      {formatRelative(u.at)}
                    </time>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {shown.length < updates.length && (
        <button type="button" className="card-foot-link mw-more" onClick={() => setShowAll(true)}>
          Show all {updates.length} updates <Icon.ChevDown className="ico" />
        </button>
      )}
    </>
  );
}
