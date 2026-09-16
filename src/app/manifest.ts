import type { MetadataRoute } from "next";

// Web App Manifest (served at /manifest.webmanifest and auto-linked by Next).
// Icons are generated on the fly by the /pwa-icon route handler.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BOM Studio",
    short_name: "BOM Studio",
    description: "Bill of Materials management for hardware teams.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0e1330",
    theme_color: "#5562ff",
    categories: ["business", "productivity"],
    icons: [
      { src: "/pwa-icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=192&maskable=1", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-icon?size=512&maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
