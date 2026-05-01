"use client";

import { useTweaks } from "@/stores/tweaks-store";
import { Button } from "@/components/ui/button";

export function LayoutToggle() {
  const { layout, setLayout } = useTweaks();
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-line)]">
      <Button variant={layout === "split" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setLayout("split")}>Side filters</Button>
      <Button variant={layout === "stacked" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setLayout("stacked")}>Top filters</Button>
    </div>
  );
}
