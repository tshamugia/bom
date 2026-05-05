"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ColumnKey = "sku" | "desc" | "cat" | "vendor" | "unit" | "qty";

type State = {
  layout: "split" | "stacked";
  columns: Record<ColumnKey, boolean>;
};
type Actions = {
  setLayout: (l: "split" | "stacked") => void;
  toggleColumn: (k: ColumnKey) => void;
};

export const useTweaks = create<State & Actions>()(
  persist(
    set => ({
      layout: "split",
      columns: { sku: true, desc: true, cat: true, vendor: true, unit: true, qty: true },
      setLayout: layout => set({ layout }),
      toggleColumn: k =>
        set(s => ({ columns: { ...s.columns, [k]: !s.columns[k] } })),
    }),
    { name: "bom-tweaks" },
  ),
);
