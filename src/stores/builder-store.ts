"use client";

import { create } from "zustand";

type State = {
  vendorFilter: Set<string>;
  categoryFilter: Set<string>;
  subcategoryFilter: Set<string>;
  search: string;
  comboOpen: boolean;
};

type Actions = {
  toggle: (key: "vendorFilter" | "categoryFilter" | "subcategoryFilter", value: string) => void;
  setSearch: (v: string) => void;
  setComboOpen: (v: boolean) => void;
  clear: () => void;
};

export const useBuilder = create<State & Actions>((set) => ({
  vendorFilter: new Set(),
  categoryFilter: new Set(),
  subcategoryFilter: new Set(),
  search: "",
  comboOpen: false,

  toggle: (key, value) =>
    set(s => {
      const next = new Set(s[key]);
      next.has(value) ? next.delete(value) : next.add(value);
      return { [key]: next } as Partial<State>;
    }),
  setSearch: search => set({ search, comboOpen: true }),
  setComboOpen: comboOpen => set({ comboOpen }),
  clear: () => set({
    vendorFilter: new Set(),
    categoryFilter: new Set(),
    subcategoryFilter: new Set(),
    search: "",
  }),
}));
