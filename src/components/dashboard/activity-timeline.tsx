import { Icon } from "@/components/icons";

type Item = {
  id: string;
  kind: string;
  summary: string;
  createdAt: Date;
  actorName: string | null;
};

type Tone = "success" | "info" | "warning" | "danger" | "accent";

const TONE_COLORS: Record<Tone, string> = {
  success: "var(--color-success)",
  info:    "var(--color-info)",
  warning: "var(--color-warning)",
  danger:  "var(--color-danger)",
  accent:  "var(--color-accent)",
};

function kindStyle(kind: string): { tone: Tone; icon: typeof Icon[keyof typeof Icon] } {
  if (kind.includes(".approved"))                             return { tone: "success", icon: Icon.Check };
  if (kind.includes(".rejected"))                             return { tone: "danger",  icon: Icon.X };
  if (kind.includes(".deleted"))                              return { tone: "danger",  icon: Icon.Trash };
  if (kind.includes(".created") || kind.includes(".added"))   return { tone: "success", icon: Icon.Plus };
  if (kind.includes(".imported"))                             return { tone: "info",    icon: Icon.Upload };
  if (kind.includes(".exported") || kind.includes(".generated")) return { tone: "info", icon: Icon.Download };
  if (kind.includes(".requested"))                            return { tone: "info",    icon: Icon.Send };
  if (kind.includes(".updated") || kind.includes(".renamed")
      || kind.includes(".moved") || kind.includes(".reordered")) return { tone: "info", icon: Icon.Edit };
  if (kind.startsWith("stock.") || kind.endsWith(".alert"))   return { tone: "warning", icon: Icon.AlertTriangle };
  return { tone: "accent", icon: Icon.Activity };
}

export function ActivityTimeline({ items }: { items: Item[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-3"><h3 className="text-[13.5px] font-semibold">Recent activity</h3></div>
      <div className="px-4 py-3">
        <ol className="relative pl-6">
          <span className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--color-line)]" />
          {items.map((it) => {
            const { tone, icon: KindIcon } = kindStyle(it.kind);
            const color = TONE_COLORS[tone];
            return (
              <li key={it.id} className="relative pb-3 last:pb-0">
                <span
                  className="absolute left-[-22px] top-1 h-3 w-3 rounded-full border-2"
                  style={{ borderColor: color, backgroundColor: color }}
                />
                <div className="flex items-center gap-1.5 text-[13px] font-medium">
                  <KindIcon size={12} style={{ color }} />
                  <span>{it.summary}</span>
                </div>
                <div className="text-[11.5px] text-[var(--color-text-3)]">
                  {relative(it.createdAt)} {it.actorName ? `· ${it.actorName}` : ""}
                </div>
              </li>
            );
          })}
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
