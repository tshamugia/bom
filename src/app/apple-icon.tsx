import { ImageResponse } from "next/og";

// Apple touch icon (home-screen icon on iOS). iOS applies its own rounding,
// so fill the square and inset the glyph slightly.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #5562ff 0%, #8a5cff 100%)",
          color: "#ffffff",
          fontSize: 104,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          fontFamily: "sans-serif",
        }}
      >
        B
      </div>
    ),
    { ...size },
  );
}
