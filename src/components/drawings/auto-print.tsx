"use client";

import { useEffect } from "react";

/** Opens the browser's print dialog (→ "Save as PDF") once fonts are in, plus a manual button. */
export function AutoPrint({ backHref }: { backHref: string }) {
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="report-toolbar">
      <a href={backHref}>← Back to dashboard</a>
      <span style={{ flex: 1 }} />
      <span>Choose “Save as PDF” as the printer to download the file.</span>
      <button type="button" onClick={() => window.print()}>Print / Save as PDF</button>
    </div>
  );
}
