import Link from "next/link";
import { Icon } from "@/components/icons";
import type { MyWorkCounts } from "@/lib/my-work";
import { MyWorkKpis } from "./my-work-kpis";

/** Top of the dashboard: the user's own share of the work, with the way into My work. */
export function MyWorkStrip({ counts }: { counts: MyWorkCounts }) {
  const clear = counts.todo + counts.overdue + counts.dueSoon + counts.newUpdates === 0;
  return (
    <section className="card mw-strip" aria-labelledby="mw-strip-title">
      <div className="card-head">
        <span className="irow-ico tone-accent"><Icon.Inbox className="ico" /></span>
        <div style={{ minWidth: 0 }}>
          <h2 id="mw-strip-title" className="card-title">Your work</h2>
          <p className="card-sub">
            {clear ? "You're all caught up." : "Approvals, receipts, remarks and deadlines that are yours."}
          </p>
        </div>
        <span className="spacer" />
        <Link href="/my-work" className="btn btn-sm max-[700.98px]:hidden">
          Open My work <Icon.Chevron className="ico" />
        </Link>
      </div>
      <div className="mw-strip-body">
        <MyWorkKpis counts={counts} base="/my-work" />
      </div>
      <Link href="/my-work" className="card-foot-link min-[701px]:hidden">
        Open My work <Icon.Chevron className="ico" />
      </Link>
    </section>
  );
}
