import { MARK_GRID, MARK_PATH, MARK_TILE_RADIUS } from "@/lib/brand";

/**
 * The Revline mark — the R on an accent tile, same artwork as the favicon and
 * app icons. Decorative: it always sits next to the name.
 */
export function LogoMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`}
      aria-hidden
      focusable="false"
      className={className}
      style={{ flexShrink: 0, display: "block" }}
    >
      <rect width={MARK_GRID} height={MARK_GRID} rx={MARK_TILE_RADIUS} fill="var(--accent)" />
      <path d={MARK_PATH} fill="var(--on-accent)" />
    </svg>
  );
}
