"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ColumnKey = "sku" | "desc" | "cat" | "vendor" | "mfr" | "unit" | "qty";

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
      columns: { sku: true, desc: true, cat: true, vendor: true, mfr: true, unit: true, qty: true },
      setLayout: layout => set({ layout }),
      toggleColumn: k =>
        set(s => ({ columns: { ...s.columns, [k]: !s.columns[k] } })),
    }),
    {
      name: "bom-tweaks",
      version: 2,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<State>;
        if (version < 2) {
          state.columns = {
            sku: true, desc: true, cat: true, vendor: true, unit: true, qty: true,
            ...(state.columns ?? {}),
            mfr: true,
          };
        }
        return state as State;
      },
    },
  ),
);
