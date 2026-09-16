import { ImageResponse } from "next/og";

// Generates the PWA icons referenced by app/manifest.ts.
//   /pwa-icon?size=192            → rounded "any" icon
//   /pwa-icon?size=512&maskable=1 → full-bleed maskable icon (safe-zone letter)
const GRADIENT = "linear-gradient(135deg, #5562ff 0%, #8a5cff 100%)";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("size")) || 512;
  const size = Math.min(1024, Math.max(48, requested));
  const maskable = searchParams.get("maskable") === "1";

  // Maskable icons must fill the whole square (the OS applies its own mask);
  // keep the glyph inside the ~80% safe zone. "any" icons get rounded corners.
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const fontSize = Math.round(size * (maskable ? 0.44 : 0.58));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: GRADIENT,
          borderRadius: radius,
          color: "#ffffff",
          fontSize,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          fontFamily: "sans-serif",
        }}
      >
        B
      </div>
    ),
    { width: size, height: size },
  );
}
