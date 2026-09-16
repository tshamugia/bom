type Item = {
  id: string;
  kind: string;
  summary: string;
  createdAt: Date;
  actorName: string | null;
};

function itemState(kind: string): "done" | "active" | "" {
  if (kind.includes(".approved") || kind.includes(".created") || kind.includes(".added")
    || kind.includes(".exported") || kind.includes(".generated")) return "done";
  if (kind.includes(".requested") || kind.includes(".updated") || kind.includes(".renamed")) return "active";
  return "";
}

export function ActivityTimeline({ items }: { items: Item[] }) {
  return (
    <div className="card">
      <div className="card-head"><h3 className="card-title">Recent activity</h3></div>
      <div style={{ padding: "12px 16px" }}>
        <div className="timeline">
          {items.map((it) => (
            <div key={it.id} className={`tl-item ${itemState(it.kind)}`}>
              <div className="tl-dot" />
              <div className="tl-title">{it.summary}</div>
              <div className="tl-meta">
                {relative(it.createdAt)}{it.actorName ? ` · ${it.actorName}` : ""}
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No recent activity yet.</div>}
        </div>
      </div>
    </div>
  );
}

function relative(d: Date | string) {
  const ms = Date.now() - new Date(d).getTime();
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} minutes ago`;
  if (h < 24) return `${Math.round(h)} hours ago`;
  return `${Math.round(h / 24)} days ago`;
}
