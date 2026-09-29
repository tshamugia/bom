import Link from "next/link";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { DrawingStatusBadge } from "@/components/drawings/drawing-status-badge";
import { AcknowledgeButton } from "@/components/drawings/acknowledge-button";
import { DashboardProjectFilter, type ProjectFilterOption } from "@/components/dashboard/project-filter";
import { formatDate, formatRelative } from "@/lib/format";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { TRANSMITTAL_PURPOSE_LABEL } from "@/lib/drawing-meta";
import { addDays, daysBetween } from "@/lib/drawing-reminders";
import { DUE_SOON_DAYS, type DashboardDrawing, type DrawingSummary } from "@/lib/drawing-dashboard";
import type { Deadline } from "@/server/queries/dashboard";
import type { FeedBomSend, FeedTransmittal, StatusFeed } from "@/server/queries/status-overview";
import { StatusBar, StatusLegend } from "./status-mix";

/** Project dates this far ahead show up under "Coming up". */
const DEADLINE_HORIZON_DAYS = 30;
const LIST_LIMIT = 8;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function Card({
  title,
  sub,
  count,
  children,
  foot,
}: {
  title: string;
  sub?: string;
  count?: number;
  children: React.ReactNode;
  foot?: { href: string; label: string };
}) {
  return (
    <section className="card" style={{ minWidth: 0 }}>
      <div className="card-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="card-title">{title}</h2>
          {sub && <p className="card-sub">{sub}</p>}
        </div>
        <span className="spacer" />
        {count !== undefined && <span className="pill tabular">{count}</span>}
      </div>
      {children}
      {foot && (
        <Link href={foot.href} className="card-foot-link">
          {foot.label} <Icon.Chevron className="ico" />
        </Link>
      )}
    </section>
  );
}

function PendingReceipts({ rows }: { rows: StatusFeed["mine"] }) {
  if (rows.length === 0) return null;
  return (
    <section className="card ack-card" aria-labelledby="ack-title">
      <div className="card-head">
        <span className="irow-ico tone-accent"><Icon.Inbox className="ico" /></span>
        <div style={{ minWidth: 0 }}>
          <h2 id="ack-title" className="card-title">Issued to you</h2>
          <p className="card-sub">Confirm you received {rows.length === 1 ? "this revision" : "these revisions"}.</p>
        </div>
        <span className="spacer" />
        <span className="pill tabular">{rows.length}</span>
      </div>
      {rows.map(t => (
        <div key={t.id} className="ack-row">
          <Link href={`/drawings/${t.drawingId}`} style={{ color: "inherit", minWidth: 0 }}>
            <div className="irow-title">
              <span className="mono">{t.code}</span> <span className="mono muted">{formatDrawingRevision(t.revisionNumber)}</span>
            </div>
            <div className="irow-text">{t.name}</div>
            <div className="irow-meta">
              {[TRANSMITTAL_PURPOSE_LABEL[t.purpose], t.projectCode, `from ${t.sentByName ?? "—"}`, formatRelative(t.createdAt)].join(" · ")}
            </div>
            {t.note && <div className="irow-meta" style={{ whiteSpace: "pre-line" }}>“{t.note}”</div>}
          </Link>
          <AcknowledgeButton id={t.id} label="Confirm receipt" className="btn btn-primary" />
        </div>
      ))}
    </section>
  );
}

function ProgressCard({ summary, projectQs }: { summary: DrawingSummary; projectQs: string }) {
  const t = summary.totals;
  const awaiting = t.inReview + t.awaitingApproval;
  return (
    <Card title="Drawing progress" sub="Latest revision of every drawing.">
      {t.total === 0 ? (
        <div className="card-empty">No drawings yet.</div>
      ) : (
        <div className="vh-progress">
          <div className="vh-big">
            <span className="vh-big-num">{t.progressPct}%</span>
            <span className="vh-big-lab">approved · {t.closed} of {plural(t.total, "drawing")}</span>
          </div>
          <StatusBar counts={summary.byStatus} />
          <StatusLegend counts={summary.byStatus} />
          <div className="kpi-row">
            <Link href={`/drawings?overdue=1${projectQs}`} className={`kpi ${t.overdue ? "danger" : ""}`}>
              <div className="kpi-n">{t.overdue}</div>
              <div className="kpi-l">Overdue</div>
            </Link>
            <div className={`kpi ${awaiting ? "warn" : ""}`}>
              <div className="kpi-n">{awaiting}</div>
              <div className="kpi-l">Awaiting approval</div>
            </div>
            <div className="kpi">
              <div className="kpi-n">{t.dueSoon}</div>
              <div className="kpi-l">Due in {DUE_SOON_DAYS} days</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

type Waiting = { d: DashboardDrawing; days: number | null; internal: boolean };

function WaitingCard({ rows, projectQs }: { rows: Waiting[]; projectQs: string }) {
  return (
    <Card
      title="Waiting for approval"
      sub="Internal check by a second engineer, then approval. Longest wait first."
      count={rows.length}
      foot={rows.length > LIST_LIMIT ? { href: `/drawings?status=awaiting-approval${projectQs}`, label: "All drawings awaiting approval" } : undefined}
    >
      {rows.length === 0 ? (
        <div className="card-empty">Nothing is waiting for approval.</div>
      ) : (
        <ul className="ilist">
          {rows.slice(0, LIST_LIMIT).map(({ d, days, internal }) => (
            <li key={d.id}>
              <Link href={`/drawings/${d.id}`} className="irow">
                <span className={`irow-ico ${internal ? "tone-amber" : "tone-pink"}`}><Icon.Hourglass className="ico" /></span>
                <div className="irow-body">
                  <div className="irow-title">
                    <span className="mono">{d.code}</span> <span className="mono muted">{formatDrawingRevision(d.revisionNumber)}</span>
                  </div>
                  <div className="irow-text">{d.name}</div>
                  <div className="irow-meta">
                    <DrawingStatusBadge status={d.status} />
                    <span>{[d.projectCode, internal && d.reviewerName ? `with ${d.reviewerName}` : null].filter(Boolean).join(" · ")}</span>
                  </div>
                </div>
                {days !== null && (
                  <div className="irow-side">
                    <span className={`big ${days >= 5 ? "red" : days >= 3 ? "amber" : ""}`}>{days}d</span>
                    <span>waiting</span>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type Sent =
  | { kind: "drawing"; at: Date; t: FeedTransmittal }
  | { kind: "bom"; at: Date; b: FeedBomSend };

function TransmittalRow({ t, userId }: { t: FeedTransmittal; userId: string }) {
  const to = t.recipientUserId === userId ? "you" : t.recipientName ?? t.externalName ?? "—";
  return (
    <Link href={`/drawings/${t.drawingId}`} className="irow">
      <span className="irow-ico tone-accent"><Icon.Send className="ico" /></span>
      <div className="irow-body">
        <div className="irow-title">
          <span className="mono">{t.code}</span> <span className="mono muted">{formatDrawingRevision(t.revisionNumber)}</span>
        </div>
        <div className="irow-text">{t.name}</div>
        <div className="irow-meta">
          {[`To ${to}`, TRANSMITTAL_PURPOSE_LABEL[t.purpose], t.projectCode, formatRelative(t.createdAt)].join(" · ")}
        </div>
      </div>
      <div className="irow-side">
        {t.superseded ? (
          <Badge tone="gray">Superseded</Badge>
        ) : t.acknowledgedAt ? (
          <Badge tone="success">Received</Badge>
        ) : t.recipientUserId ? (
          <Badge tone="warning">Not confirmed</Badge>
        ) : (
          <Badge tone="gray">Recorded</Badge>
        )}
      </div>
    </Link>
  );
}

function BomSendRow({ b }: { b: FeedBomSend }) {
  return (
    <div className="irow">
      <span className="irow-ico tone-green"><Icon.Doc className="ico" /></span>
      <Link href={`/preview/${b.projectId}/${b.bomId}`} className="irow-body" style={{ color: "inherit" }}>
        <div className="irow-title">
          {b.bomName} <span className="mono muted">Rev {b.revisionLetter}</span>
        </div>
        <div className="irow-text">Sent to procurement</div>
        <div className="irow-meta">
          {[b.projectCode, formatRelative(b.requestedAt), b.requestedByName ? `by ${b.requestedByName}` : null].filter(Boolean).join(" · ")}
        </div>
      </Link>
      {b.exportId && (
        <a
          href={`/api/exports/${b.exportId}/download`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-icon btn-ghost"
          aria-label={`Download ${b.bomName} Rev ${b.revisionLetter}`}
          title="Download Excel"
        >
          <Icon.Download className="ico" />
        </a>
      )}
    </div>
  );
}

function SentCard({ items, userId }: { items: Sent[]; userId: string }) {
  return (
    <Card
      title="Recently sent"
      sub="Drawing revisions issued and BOMs sent to procurement."
      foot={{ href: "/approvals", label: "Everything sent" }}
    >
      {items.length === 0 ? (
        <div className="card-empty">Nothing has been sent yet.</div>
      ) : (
        <ul className="ilist">
          {items.map(i => (
            <li key={`${i.kind}:${i.kind === "drawing" ? i.t.id : i.b.id}`}>
              {i.kind === "drawing" ? <TransmittalRow t={i.t} userId={userId} /> : <BomSendRow b={i.b} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type Upcoming = {
  key: string;
  href: string;
  date: string;
  title: React.ReactNode;
  text: string;
  meta: string;
  kind: "drawing" | "date";
};

function ComingUpCard({ items, today, projectQs }: { items: Upcoming[]; today: string; projectQs: string }) {
  return (
    <Card
      title="Coming up"
      sub={`Drawings due in ${DUE_SOON_DAYS} days and project dates in the next ${DEADLINE_HORIZON_DAYS}.`}
      count={items.length}
      foot={items.length > LIST_LIMIT ? { href: `/drawings?overdue=1${projectQs}`, label: "All overdue drawings" } : undefined}
    >
      {items.length === 0 ? (
        <div className="card-empty">No due dates coming up.</div>
      ) : (
        <ul className="ilist">
          {items.slice(0, LIST_LIMIT).map(u => {
            const late = u.date < today ? daysBetween(u.date, today) : 0;
            const left = u.date >= today ? daysBetween(today, u.date) : 0;
            return (
              <li key={u.key}>
                <Link href={u.href} className="irow">
                  <span className={`irow-ico ${late ? "tone-red" : u.kind === "date" ? "" : "tone-accent"}`}>
                    {u.kind === "date" ? <Icon.Flag className="ico" /> : <Icon.Drawing className="ico" />}
                  </span>
                  <div className="irow-body">
                    <div className="irow-title">{u.title}</div>
                    <div className="irow-text">{u.text}</div>
                    <div className="irow-meta"><span>{u.meta}</span></div>
                  </div>
                  <div className="irow-side">
                    <span className={`big ${late ? "red" : left <= 2 ? "amber" : ""}`}>
                      {late ? `${late}d late` : left === 0 ? "Today" : `${left}d`}
                    </span>
                    <span>{formatDate(u.date)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ProjectsCard({ summary }: { summary: DrawingSummary }) {
  const groups = summary.byProject;
  if (groups.length === 0) return null;
  return (
    <Card title="Projects" sub="Drawings approved per project." count={groups.length}>
      {groups.map(g => {
        const pct = g.total ? Math.round((g.closed / g.total) * 100) : 0;
        const awaiting = g.byStatus["need-approval"] + g.byStatus["awaiting-approval"];
        return (
          <Link key={g.key} href={`/dashboard?project=${g.key}`} className="proj-row">
            <div className="proj-top">
              <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{g.label}</span>
              <span className="proj-name">{g.sublabel}</span>
              <span className="proj-pct">{pct}%</span>
            </div>
            <StatusBar counts={g.byStatus} height={8} />
            <div className="proj-meta">
              <span>{g.closed} of {plural(g.total, "drawing")} approved</span>
              {awaiting > 0 && <span>{awaiting} awaiting approval</span>}
              {g.overdue > 0 && <span className="red">{g.overdue} overdue</span>}
            </div>
          </Link>
        );
      })}
    </Card>
  );
}

export function ViewerOverview({
  userId,
  userName,
  today,
  project,
  projectOptions,
  drawings,
  summary,
  deadlines,
  feed,
  awaitingSince,
}: {
  userId: string;
  userName: string;
  today: string;
  project: ProjectFilterOption | null;
  projectOptions: ProjectFilterOption[];
  drawings: DashboardDrawing[];
  summary: DrawingSummary;
  deadlines: Deadline[];
  feed: StatusFeed;
  /** Day each awaiting-approval drawing got there, by drawing id. */
  awaitingSince: Map<string, string>;
}) {
  const qs = project ? `?project=${project.id}` : "";
  const projectQs = project ? `&project=${project.id}` : "";

  const waiting: Waiting[] = [
    ...summary.reviewQueue.map(d => ({ d, days: d.needApprovalSince ? d.daysWaiting : null, internal: true })),
    ...drawings
      .filter(d => d.status === "awaiting-approval")
      .map(d => {
        const since = awaitingSince.get(d.id);
        return { d, days: since ? daysBetween(since, today) : null, internal: false };
      }),
  ].sort((a, b) => (b.days ?? -1) - (a.days ?? -1));

  const sent: Sent[] = [
    ...feed.issued.map(t => ({ kind: "drawing" as const, at: new Date(t.createdAt), t })),
    ...feed.bomSends.map(b => ({ kind: "bom" as const, at: new Date(b.requestedAt), b })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, LIST_LIMIT);

  const horizon = addDays(today, DEADLINE_HORIZON_DAYS);
  const upcoming: Upcoming[] = [
    ...[...summary.overdue, ...summary.dueSoon].map(d => ({
      key: `d:${d.id}`,
      href: `/drawings/${d.id}`,
      date: d.dueDate!,
      title: <><span className="mono">{d.code}</span> <span className="mono muted">{formatDrawingRevision(d.revisionNumber)}</span></>,
      text: d.name,
      meta: `${d.projectCode} · drawing due`,
      kind: "drawing" as const,
    })),
    ...deadlines
      .filter(d => d.date <= horizon)
      .map(d => ({
        key: d.key,
        href: `/projects/${d.projectId}`,
        date: d.date,
        title: d.label,
        text: d.projectName,
        meta: `${d.projectCode} · ${d.label === "Completion" ? "project completion" : "milestone"}`,
        kind: "date" as const,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const firstName = userName.trim().split(/\s+/)[0] || userName;

  return (
    <>
      <header className="vh-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="vh-hello">Hello, {firstName}</h1>
          <p className="vh-sub">
            {project ? `${project.code} — ${project.name}` : "All projects"} · as of {formatDate(today)}
          </p>
        </div>
        <div className="page-actions">
          <DashboardProjectFilter projects={projectOptions} value={project?.id ?? ""} />
          <a href={`/reports/dashboard${qs}`} target="_blank" rel="noopener" className="btn">
            <Icon.Print className="ico" /> Report
          </a>
        </div>
      </header>

      {/* Two columns on desktop; on phones the columns dissolve and `order`
          puts what needs attention first. */}
      <div className="vh-grid">
        <div className="vh-col">
          <div style={{ order: 1 }}><PendingReceipts rows={feed.mine} /></div>
          <div style={{ order: 2 }}><ProgressCard summary={summary} projectQs={projectQs} /></div>
          <div style={{ order: 3 }}><WaitingCard rows={waiting} projectQs={projectQs} /></div>
          {!project && <div style={{ order: 6 }}><ProjectsCard summary={summary} /></div>}
        </div>
        <div className="vh-col">
          <div style={{ order: 4 }}><SentCard items={sent} userId={userId} /></div>
          <div style={{ order: 5 }}><ComingUpCard items={upcoming} today={today} projectQs={projectQs} /></div>
        </div>
      </div>
    </>
  );
}
