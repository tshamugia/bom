// Revline brand: the name, the mark and the raw colors the generated icons use.
// Client-safe. The in-app logo (components/brand/logo.tsx) fills the same path
// with the --accent / --on-accent tokens; the icons can't read CSS variables,
// so they use BRAND_BLUE, which matches the light-theme --accent in globals.css.
// src/app/icon.svg and favicon.ico are built from this file by
// `npx tsx scripts/brand-icons.ts` — rerun it after changing the mark.

export const BRAND_NAME = "Revline";
export const BRAND_COMPANY = "Insta";
export const BRAND_DESCRIPTION = "Engineering drawings, BOMs and procurement in one place.";

export const BRAND_BLUE = "#1f5fd1";
// Sidebar / splash background (--sb-bg).
export const BRAND_INK = "#151b27";

// The mark: a geometric R whose leg runs out into a line (rev → line).
// 64-unit grid; one path, outline wound clockwise and the counter
// counter-clockwise, so it fills correctly under any fill rule.
export const MARK_GRID = 64;
export const MARK_PATH =
  "M15 14H27A12 12 0 0 1 30.38 37.51L34.5 43H49V50H31L22 38V50H15Z" +
  "M22 21V31H27A5 5 0 0 0 27 21Z";
// Tile corner radius on the same grid (~22%, like the platform app icons).
export const MARK_TILE_RADIUS = 14;

/**
 * The mark as a standalone SVG document (for icon files and ImageResponse).
 * `radius` rounds the tile (0 = full bleed); `scale` shrinks the R about the
 * centre, e.g. to keep it inside a maskable icon's safe zone.
 */
export function markSvg({ radius = MARK_TILE_RADIUS, scale = 1 }: { radius?: number; scale?: number } = {}) {
  const c = MARK_GRID / 2;
  const glyph = scale === 1
    ? `<path d="${MARK_PATH}" fill="#fff"/>`
    : `<path d="${MARK_PATH}" fill="#fff" transform="translate(${c} ${c}) scale(${scale}) translate(${-c} ${-c})"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_GRID} ${MARK_GRID}">` +
    `<rect width="${MARK_GRID}" height="${MARK_GRID}" rx="${radius}" fill="${BRAND_BLUE}"/>` +
    glyph +
    `</svg>`
  );
}

/** `markSvg` as a data: URL, for an <img> inside ImageResponse. */
export function markDataUrl(opts?: Parameters<typeof markSvg>[0]) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(markSvg(opts))}`;
}
