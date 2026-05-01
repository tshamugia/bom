type Item = {
  id: string;
  kind: string;
  summary: string;
  createdAt: Date;
  actorName: string | null;
};

export function ActivityTimeline({ items }: { items: Item[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-3"><h3 className="text-[13.5px] font-semibold">Recent activity</h3></div>
      <div className="px-4 py-3">
        <ol className="relative pl-6">
          <span className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--color-line)]" />
          {items.map((it, i) => (
            <li key={it.id} className="relative pb-3 last:pb-0">
              <span className={`absolute left-[-22px] top-1 h-3 w-3 rounded-full border-2 ${i === 0 ? "border-[var(--color-accent)] bg-[var(--color-accent)]" : "border-[var(--color-line-strong)] bg-[var(--color-surface)]"}`} />
              <div className="text-[13px] font-medium">{it.summary}</div>
              <div className="text-[11.5px] text-[var(--color-text-3)]">
                {relative(it.createdAt)} {it.actorName ? `· ${it.actorName}` : ""}
              </div>
            </li>
          ))}
          {items.length === 0 && <li className="text-[12.5px] text-[var(--color-text-3)]">No recent activity yet.</li>}
        </ol>
      </div>
    </div>
  );
}

function relative(d: Date | string) {
  const ms = Date.now() - new Date(d).getTime();
  const h = ms / 3_600_000;
  if (h < 1)  return `${Math.max(1, Math.round(ms / 60_000))} minutes ago`;
  if (h < 24) return `${Math.round(h)} hours ago`;
  return `${Math.round(h / 24)} days ago`;
}
