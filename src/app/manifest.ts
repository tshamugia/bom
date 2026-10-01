import type { MetadataRoute } from "next";
import { BRAND_BLUE, BRAND_DESCRIPTION, BRAND_INK, BRAND_NAME } from "@/lib/brand";

// Web App Manifest (served at /manifest.webmanifest and auto-linked by Next).
// Icons are generated on the fly by the /pwa-icon route handler.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    // Opened from the home screen it's mostly for checking progress, so land on the dashboard.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: BRAND_INK,
    theme_color: BRAND_BLUE,
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
