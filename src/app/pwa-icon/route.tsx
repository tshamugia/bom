import { ImageResponse } from "next/og";
import { markDataUrl } from "@/lib/brand";

// Generates the PWA icons referenced by app/manifest.ts.
//   /pwa-icon?size=192            → rounded "any" icon
//   /pwa-icon?size=512&maskable=1 → full-bleed maskable icon (R inside the safe zone)
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("size")) || 512;
  const size = Math.min(1024, Math.max(48, requested));
  const maskable = searchParams.get("maskable") === "1";

  // Maskable icons must fill the whole square (the OS applies its own mask)
  // and keep the artwork inside the central 80% circle, so the R shrinks a
  // little. "any" icons keep the rounded tile.
  const src = maskable ? markDataUrl({ radius: 0, scale: 0.84 }) : markDataUrl();

  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} />,
    { width: size, height: size },
  );
}
