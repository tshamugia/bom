"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Polling stops after this long; the run is closed as stale long before anyone waits that much. */
const GIVE_UP_MS = 20 * 60 * 1000;

/**
 * Reloads the page's data while a DXF check runs, so its result shows up
 * without a manual refresh. Rendered only while a run is uploading or checking.
 */
export function CheckRefresher({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > GIVE_UP_MS) {
        window.clearInterval(timer);
        return;
      }
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
