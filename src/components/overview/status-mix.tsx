import { DRAWING_STATUSES, DRAWING_STATUS_LABEL } from "@/lib/drawing-status";
import type { StatusCounts } from "@/lib/drawing-dashboard";

function describe(counts: StatusCounts): string {
  return DRAWING_STATUSES.filter(s => counts[s] > 0)
    .map(s => `${DRAWING_STATUS_LABEL[s]}: ${counts[s]}`)
    .join(", ");
}

/** One bar split by drawing status, in lifecycle order — the same hues as the status badges. */
export function StatusBar({ counts, height }: { counts: StatusCounts; height?: number }) {
  const shown = DRAWING_STATUSES.filter(s => counts[s] > 0);
  return (
    <div className="seg-bar" role="img" aria-label={shown.length ? describe(counts) : "No drawings"} style={height ? { height } : undefined}>
      {shown.map(s => (
        <span key={s} className={`st-${s}`} style={{ flex: `${counts[s]} 1 0` }} title={`${DRAWING_STATUS_LABEL[s]}: ${counts[s]}`} />
      ))}
    </div>
  );
}

/** Legend for `StatusBar` — only the statuses that have drawings. */
export function StatusLegend({ counts }: { counts: StatusCounts }) {
  return (
    <ul className="legend">
      {DRAWING_STATUSES.filter(s => counts[s] > 0).map(s => (
        <li key={s}>
          <span className={`sw st-${s}`} aria-hidden />
          <span className="lab">{DRAWING_STATUS_LABEL[s]}</span>
          <span className="n">{counts[s]}</span>
        </li>
      ))}
    </ul>
  );
}
