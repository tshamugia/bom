import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Georgian } from "next/font/google";
import Script from "next/script";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
// Fallback for Georgian glyphs (Geist has none). Not preloaded: the browser
// only fetches it via unicode-range when Georgian text is actually on screen.
const notoGeorgian = Noto_Sans_Georgian({ subsets: ["georgian"], variable: "--font-georgian", preload: false });

export const metadata: Metadata = {
  title: "BOM Studio",
  description: "Bill of Materials management for hardware teams.",
  applicationName: "BOM Studio",
  // <link rel="manifest"> is injected automatically from app/manifest.ts.
  appleWebApp: {
    capable: true,
    title: "BOM Studio",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the iOS standalone app draw under the notch; globals.css pads for the safe areas.
  viewportFit: "cover",
  // The design tokens are light-only; dark is opt-in via the theme toggle.
  colorScheme: "light",
  themeColor: "#ffffff",
};

const themeScript = `
(function(){try{var m=localStorage.getItem('theme');var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${notoGeorgian.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
