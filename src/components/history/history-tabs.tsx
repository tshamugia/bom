import Link from "next/link";

export type HistoryTab = "exports" | "activity";

export function HistoryTabs({ active, query }: { active: HistoryTab; query: string }) {
  const tabs: Array<{ id: HistoryTab; label: string }> = [
    { id: "exports", label: "Exports" },
    { id: "activity", label: "Activity" },
  ];
  return (
    <div className="tabs">
      {tabs.map(t => {
        const params = new URLSearchParams(query);
        params.set("tab", t.id);
        const isActive = active === t.id;
        return (
          <Link
            key={t.id}
            href={`/history?${params.toString()}`}
            className={`tab ${isActive ? "active" : ""}`}
            scroll={false}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
