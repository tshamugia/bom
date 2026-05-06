"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { globalSearch, type SearchHit } from "@/server/actions/search";
import { Icon } from "@/components/icons";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isOpen = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isOpen) {
        e.preventDefault();
        setQuery("");
        setHits([]);
        setActive(0);
        setOpen(prev => !prev);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        setHits([]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await globalSearch(q);
          setHits(res);
          setActive(0);
        } catch {
          setHits([]);
        }
      });
    }, 120);
    return () => clearTimeout(handle);
  }, [query]);

  function openPalette() {
    setQuery("");
    setHits([]);
    setActive(0);
    setOpen(true);
  }

  function closePalette() {
    setOpen(false);
    setQuery("");
    setHits([]);
  }

  function onQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length === 0) setHits([]);
  }

  const grouped = useMemo(() => {
    const groups: { label: string; entries: SearchHit[] }[] = [
      { label: "Projects", entries: hits.filter(h => h.kind === "project") },
      { label: "Items", entries: hits.filter(h => h.kind === "item") },
      { label: "Vendors", entries: hits.filter(h => h.kind === "vendor") },
    ];
    return groups.filter(g => g.entries.length > 0);
  }, [hits]);

  const flat = useMemo<SearchHit[]>(() => grouped.flatMap(g => g.entries), [grouped]);

  function go(hit: SearchHit | undefined) {
    if (!hit) return;
    closePalette();
    router.push(hit.href);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(a => Math.min(flat.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(a => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[active]);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search"
        className="group flex w-80 items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-left text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface)]"
      >
        <Icon.Search size={14} />
        <span className="flex-1 text-[13px] text-[var(--color-text-4)]">
          Search projects, items, vendors…
        </span>
        <span className="rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 font-mono text-[10.5px] font-medium text-[var(--color-text-3)]">
          ⌘K
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 backdrop-blur-sm"
          onClick={closePalette}
        >
          <div
            role="dialog"
            aria-label="Command palette"
            className="mt-[18vh] w-[min(640px,calc(100%-2rem))] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
              <Icon.Search size={15} className="text-[var(--color-text-3)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => onQueryChange(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search projects, items, vendors…"
                className="flex-1 border-0 bg-transparent text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-text-4)] outline-none"
              />
              <span className="rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] px-1.5 font-mono text-[10.5px] text-[var(--color-text-3)]">
                Esc
              </span>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-1">
              {query.trim().length === 0 ? (
                <div className="px-3 py-6 text-center text-[12.5px] text-[var(--color-text-3)]">
                  Type to search…
                </div>
              ) : grouped.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12.5px] text-[var(--color-text-3)]">
                  No results
                </div>
              ) : (
                grouped.map(group => (
                  <div key={group.label} className="py-1">
                    <div className="px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-4)]">
                      {group.label}
                    </div>
                    {group.entries.map(hit => {
                      const idx = flat.indexOf(hit);
                      const isActive = idx === active;
                      return (
                        <button
                          key={`${hit.kind}-${hit.id}`}
                          type="button"
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => go(hit)}
                          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] ${
                            isActive ? "bg-[var(--color-surface-2)]" : ""
                          }`}
                        >
                          <span className="flex-1 truncate">
                            <span className="font-medium text-[var(--color-text)]">{hit.primary}</span>
                            <span className="ml-2 text-[11.5px] text-[var(--color-text-3)]">{hit.secondary}</span>
                          </span>
                          {isActive && (
                            <span className="text-[10.5px] text-[var(--color-text-3)]">↵</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
