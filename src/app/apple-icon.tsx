import { ImageResponse } from "next/og";
import { markDataUrl } from "@/lib/brand";

// Apple touch icon (home-screen icon on iOS). iOS applies its own rounding,
// so the tile fills the square.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={markDataUrl({ radius: 0 })} alt="" width={size.width} height={size.height} />,
    { ...size },
  );
}
