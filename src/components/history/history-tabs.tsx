import Link from "next/link";

export type HistoryTab = "exports" | "activity";

export function HistoryTabs({ active, query }: { active: HistoryTab; query: string }) {
  const tabs: Array<{ id: HistoryTab; label: string }> = [
    { id: "exports", label: "Exports" },
    { id: "activity", label: "Activity" },
  ];
  return (
    <div className="mb-4 flex items-center gap-1 border-b border-[var(--color-line-soft)]">
      {tabs.map(t => {
        const params = new URLSearchParams(query);
        params.set("tab", t.id);
        const isActive = active === t.id;
        return (
          <Link
            key={t.id}
            href={`/history?${params.toString()}`}
            className={`relative px-3 py-2 text-[12.5px] font-medium transition-colors ${
              isActive
                ? "text-[var(--color-text)]"
                : "text-[var(--color-text-3)] hover:text-[var(--color-text)]"
            }`}
            scroll={false}
          >
            {t.label}
            {isActive && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--color-accent)]" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
