import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Georgian } from "next/font/google";
import Script from "next/script";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { BRAND_DESCRIPTION, BRAND_NAME } from "@/lib/brand";
import { THEME_META_COLOR, THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
// Fallback for Georgian glyphs (Geist has none). Not preloaded: the browser
// only fetches it via unicode-range when Georgian text is actually on screen.
const notoGeorgian = Noto_Sans_Georgian({ subsets: ["georgian"], variable: "--font-georgian", preload: false });

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_DESCRIPTION,
  applicationName: BRAND_NAME,
  // <link rel="manifest"> is injected automatically from app/manifest.ts.
  appleWebApp: {
    capable: true,
    title: BRAND_NAME,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the iOS standalone app draw under the notch; globals.css pads for the safe areas.
  viewportFit: "cover",
  // color-scheme comes from globals.css (:root / :root.dark); the theme script
  // below swaps this to the dark top-bar color when dark is on.
  themeColor: THEME_META_COLOR.light,
};

// Applies the saved theme before first paint (same rules as applyTheme in lib/theme.ts).
const themeScript = `
(function(){try{var m=localStorage.getItem('${THEME_STORAGE_KEY}');var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){var r=document.documentElement;r.classList.add('dark');r.style.colorScheme='dark';var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute('content','${THEME_META_COLOR.dark}');}}catch(e){}})();
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
