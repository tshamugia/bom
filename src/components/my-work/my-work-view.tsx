import Link from "next/link";
import { Icon } from "@/components/icons";
import { AcknowledgeButton } from "@/components/drawings/acknowledge-button";
import { DrawingStatusBadge } from "@/components/drawings/drawing-status-badge";
import { drawingFileHref } from "@/lib/drawing-files";
import { formatDate, formatRelative } from "@/lib/format";
import { formatBomRevision } from "@/lib/bom-revision";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { TRANSMITTAL_PURPOSE_LABEL } from "@/lib/drawing-meta";
import { daysBetween } from "@/lib/drawing-reminders";
import { MY_WORK_DATE_DAYS, MY_WORK_DUE_DAYS, dueLabel, type DeadlineItem, type WaitingItem } from "@/lib/my-work";
import type { MyWork } from "@/server/queries/my-work";
import { MyWorkKpis } from "./my-work-kpis";
import { UpdatesFeed } from "./updates-feed";

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function Card({
  id,
  title,
  sub,
  count,
  children,
}: {
  id: string;
  title: string;
  sub: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card mw-card" aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <div style={{ minWidth: 0 }}>
          <h2 id={`${id}-title`} className="card-title">{title}</h2>
          <p className="card-sub">{sub}</p>
        </div>
        <span className="spacer" />
        {count !== undefined && <span className="pill tabular">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function Group({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="mw-group">
      <div className="mw-group-head">
        <span>{label}</span>
        <span className="tabular">{count}</span>
      </div>
      {children}
    </div>
  );
}

function Rev({ code, rev }: { code: string; rev: string }) {
  return <span className="mw-nowrap"><span className="mono">{code}</span> <span className="mono muted">{rev}</span></span>;
}

function TodoCard({ work }: { work: MyWork }) {
  const { approvals, receipts, remarks, boms, counts, today } = work;
  return (
    <Card id="todo" title="To do" sub="What waits for you. Items leave the list once they're done." count={counts.todo}>
      {counts.todo === 0 ? (
        <div className="card-empty mw-clear">
          <Icon.CheckCircle className="ico" aria-hidden /> Nothing waits for you right now.
        </div>
      ) : (
        <>
          <Group label="Approve" count={approvals.length}>
            <ul className="ilist">
              {approvals.map(a => {
                const days = a.since ? daysBetween(a.since, today) : null;
                return (
                  <li key={a.drawingId}>
                    <Link href={`/drawings/${a.drawingId}`} className="irow">
                      <span className="irow-ico tone-amber"><Icon.Shield className="ico" /></span>
                      <div className="irow-body">
                        <div className="irow-title"><Rev code={a.code} rev={formatDrawingRevision(a.revisionNumber)} /></div>
                        <div className="irow-text">{a.name}</div>
                        <div className="irow-meta">
                          <span>{[a.projectCode, a.ownerName ? `from ${a.ownerName}` : null, "approve or send back"].filter(Boolean).join(" · ")}</span>
                        </div>
                      </div>
                      {days !== null && (
                        <div className="irow-side">
                          <span className={`big ${days >= 3 ? "red" : days >= 1 ? "amber" : ""}`}>{days === 0 ? "Today" : `${days}d`}</span>
                          <span>waiting</span>
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Group>

          <Group label="Confirm receipt" count={receipts.length}>
            {receipts.map(t => (
              <div key={t.id} className="ack-row">
                <Link href={`/drawings/${t.drawingId}`} className="mw-ack-link">
                  <span className="irow-ico tone-accent"><Icon.Inbox className="ico" /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="irow-title"><Rev code={t.code} rev={formatDrawingRevision(t.revisionNumber)} /></div>
                    <div className="irow-text">{t.name}</div>
                    <div className="irow-meta">
                      {[TRANSMITTAL_PURPOSE_LABEL[t.purpose], t.projectCode, `from ${t.sentByName ?? "—"}`, formatRelative(t.createdAt)].join(" · ")}
                    </div>
                    {t.note && <div className="irow-meta" style={{ whiteSpace: "pre-line" }}>“{t.note}”</div>}
                  </div>
                </Link>
                <div className="flex flex-wrap gap-2">
                  {t.pdfFileId && (
                    <a href={drawingFileHref(t.pdfFileId)} target="_blank" rel="noopener" className="btn">
                      <Icon.Doc className="ico" /> Open PDF
                    </a>
                  )}
                  <AcknowledgeButton id={t.id} label="Confirm receipt" className="btn btn-primary" />
                </div>
              </div>
            ))}
          </Group>

          <Group label="Open remarks on your drawings" count={remarks.length}>
            <ul className="ilist">
              {remarks.map(r => {
                const age = r.oldestDay ? daysBetween(r.oldestDay, today) : null;
                return (
                  <li key={r.drawingId}>
                    <Link href={`/drawings/${r.drawingId}#remarks`} className="irow">
                      <span className="irow-ico tone-pink"><Icon.Comment className="ico" /></span>
                      <div className="irow-body">
                        <div className="irow-title"><span className="mono">{r.code}</span> <span className="mw-plain">{r.name}</span></div>
                        {r.latestBody && <div className="irow-text mw-body">“{r.latestBody}”</div>}
                        <div className="irow-meta">
                          <span>{[r.projectCode, plural(r.open, "open remark"), "resolve or answer"].join(" · ")}</span>
                        </div>
                      </div>
                      {age !== null && (
                        <div className="irow-side">
                          <span className={`big ${age >= 7 ? "red" : age >= 3 ? "amber" : ""}`}>{age === 0 ? "Today" : `${age}d`}</span>
                          <span>oldest</span>
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Group>

          <Group label="BOMs to update" count={boms.length}>
            <ul className="ilist">
              {boms.map(b => (
                <li key={b.bomId}>
                  <Link href={`/builder/${b.projectId}/${b.bomId}`} className="irow">
                    <span className="irow-ico tone-red"><Icon.AlertTriangle className="ico" /></span>
                    <div className="irow-body">
                      <div className="irow-title">{b.bomName} <span className="mono muted">{formatBomRevision(b.revisionLetter)}</span></div>
                      <div className="irow-text">
                        Built from older drawings:{" "}
                        {b.drawings.map((d, i) => (
                          <span key={d.drawingId}>
                            {i > 0 && ", "}
                            <span className="mono">{d.code}</span> {formatDrawingRevision(d.linkedNumber)} → {formatDrawingRevision(d.latestNumber)}
                          </span>
                        ))}
                      </div>
                      <div className="irow-meta"><span>{b.projectCode} · update the BOM or confirm “No BOM change”</span></div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Group>
        </>
      )}
    </Card>
  );
}

function DeadlineRow({ item, today }: { item: DeadlineItem; today: string }) {
  const due = dueLabel(item.date, today);
  const late = due.tone === "red";
  if (item.kind === "drawing") {
    const d = item.drawing;
    return (
      <Link href={`/drawings/${d.id}`} className="irow">
        <span className={`irow-ico ${late ? "tone-red" : "tone-accent"}`}><Icon.Drawing className="ico" /></span>
        <div className="irow-body">
          <div className="irow-title"><Rev code={d.code} rev={formatDrawingRevision(d.revisionNumber)} /></div>
          <div className="irow-text">{d.name}</div>
          <div className="irow-meta">
            <DrawingStatusBadge status={d.status} />
            <span>{d.projectCode} · your drawing</span>
          </div>
        </div>
        <div className="irow-side">
          <span className={`big ${due.tone}`}>{due.text}</span>
          <span>{formatDate(item.date)}</span>
        </div>
      </Link>
    );
  }
  const p = item.project;
  return (
    <Link href={`/projects/${p.projectId}`} className="irow">
      <span className={`irow-ico ${late ? "tone-red" : ""}`}><Icon.Flag className="ico" /></span>
      <div className="irow-body">
        <div className="irow-title">{p.label}</div>
        <div className="irow-text">{p.projectName}</div>
        <div className="irow-meta">
          <span>{p.projectCode} · {p.label === "Completion" ? "project completion" : "milestone"} · you manage this project</span>
        </div>
      </div>
      <div className="irow-side">
        <span className={`big ${due.tone}`}>{due.text}</span>
        <span>{formatDate(item.date)}</span>
      </div>
    </Link>
  );
}

function DeadlinesCard({ items, today }: { items: DeadlineItem[]; today: string }) {
  return (
    <Card
      id="deadlines"
      title="Deadlines"
      sub={`Your drawings due in the next ${MY_WORK_DUE_DAYS} days and dates of projects you manage in the next ${MY_WORK_DATE_DAYS}. Late ones first.`}
      count={items.length}
    >
      {items.length === 0 ? (
        <div className="card-empty">No deadlines coming up.</div>
      ) : (
        <ul className="ilist">
          {items.map(i => <li key={i.key}><DeadlineRow item={i} today={today} /></li>)}
        </ul>
      )}
    </Card>
  );
}

function WaitingCard({ rows }: { rows: WaitingItem[] }) {
  if (rows.length === 0) return null;
  return (
    <Card id="waiting" title="Waiting on others" sub="Your drawings sent for approval. Longest wait first." count={rows.length}>
      <ul className="ilist">
        {rows.map(({ drawing: d, days, internal }) => (
          <li key={d.id}>
            <Link href={`/drawings/${d.id}`} className="irow">
              <span className={`irow-ico ${internal ? "tone-amber" : "tone-pink"}`}><Icon.Hourglass className="ico" /></span>
              <div className="irow-body">
                <div className="irow-title"><Rev code={d.code} rev={formatDrawingRevision(d.revisionNumber)} /></div>
                <div className="irow-text">{d.name}</div>
                <div className="irow-meta">
                  <DrawingStatusBadge status={d.status} />
                  <span>{[d.projectCode, internal ? `with ${d.reviewerName ?? "the approving engineer"}` : "with the client"].join(" · ")}</span>
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
    </Card>
  );
}

export function MyWorkView({ work }: { work: MyWork }) {
  return (
    <>
      <MyWorkKpis counts={work.counts} base="" keepNew />

      {/* Two columns on desktop; on phones the columns dissolve and `order`
          puts what needs action first. */}
      <div className="vh-grid">
        <div className="vh-col">
          <div style={{ order: 1 }}><TodoCard work={work} /></div>
          <div style={{ order: 2 }}><DeadlinesCard items={work.deadlines} today={work.today} /></div>
        </div>
        <div className="vh-col">
          <div style={{ order: 3 }}>
            <Card
              id="updates"
              title="Updates"
              sub="What others did on your drawings and BOMs in the last 30 days."
              count={work.updates.length}
            >
              <UpdatesFeed updates={work.updates} since={work.since} />
            </Card>
          </div>
          <div style={{ order: 4 }}><WaitingCard rows={work.waiting} /></div>
        </div>
      </div>
    </>
  );
}
