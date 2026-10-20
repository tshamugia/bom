"use client";

import { useState } from "react";
import Link from "next/link";
import { MY_WORK_DUE_DAYS, type MyWorkCounts } from "@/lib/my-work";

/**
 * Four numbers that say how much needs the user. `base` is "" on My work
 * itself (the links jump to its cards) and "/my-work" elsewhere.
 */
export function MyWorkKpis({
  counts,
  base,
  keepNew = false,
}: {
  counts: MyWorkCounts;
  base: string;
  /** Opening My work marks updates seen; keep the number the user arrived with for this visit. */
  keepNew?: boolean;
}) {
  const [arrivedNew] = useState(counts.newUpdates);
  const newUpdates = keepNew ? arrivedNew : counts.newUpdates;
  return (
    <div className="kpi-row mw-kpis">
      <Link href={`${base}#todo`} className={`kpi ${counts.todo ? "warn" : ""}`}>
        <div className="kpi-n">{counts.todo}</div>
        <div className="kpi-l">To do</div>
      </Link>
      <Link href={`${base}#deadlines`} className={`kpi ${counts.overdue ? "danger" : ""}`}>
        <div className="kpi-n">{counts.overdue}</div>
        <div className="kpi-l">Overdue</div>
      </Link>
      <Link href={`${base}#deadlines`} className="kpi">
        <div className="kpi-n">{counts.dueSoon}</div>
        <div className="kpi-l">Due in {MY_WORK_DUE_DAYS} days</div>
      </Link>
      <Link href={`${base}#updates`} className={`kpi ${newUpdates ? "info" : ""}`}>
        <div className="kpi-n">{newUpdates}</div>
        <div className="kpi-l">New updates</div>
      </Link>
    </div>
  );
}
