import type { MetadataRoute } from "next";

// Web App Manifest (served at /manifest.webmanifest and auto-linked by Next).
// Icons are generated on the fly by the /pwa-icon route handler.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BOM Studio",
    short_name: "BOM Studio",
    description: "Bill of Materials management for hardware teams.",
    // Opened from the home screen it's mostly for checking progress, so land on the dashboard.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0e1330",
    theme_color: "#5562ff",
    categories: ["business", "productivity"],
    shortcuts: [
      { name: "Dashboard", url: "/dashboard" },
      { name: "Drawings", url: "/drawings" },
      { name: "Projects", url: "/projects" },
    ],
    icons: [
      { src: "/pwa-icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=192&maskable=1", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-icon?size=512&maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
