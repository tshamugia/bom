"use client";

import { useMemo, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { useTweaks, type ColumnKey } from "@/stores/tweaks-store";
import { StockBadge } from "@/components/ui/badge";
import { moveLineToSection, removeLine, updateLineQty } from "@/server/actions/bom-lines";
import { SectionRow, type SectionInfo } from "./section-row";
import { NewSectionInlineCreate } from "./new-section-popover";

export type Line = {
  id: string;
  sku: string;
  description: string;
  manufacturer: string;
  unit: string;
  qty: number;
  unitPriceSnapshot: string;
  vendorName: string | null;
  subcategoryName: string | null;
  categoryName: string | null;
  stockState: "in-stock" | "low-stock" | "backorder" | "out-of-stock";
  sectionId: string | null;
  sectionName: string | null;
  sectionPosition: number | null;
};

type Props = {
  revisionId: string;
  lines: Line[];
  sections: SectionInfo[];
  activeSectionId: string | null;
  onActiveSectionChange: (id: string | null) => void;
};

const UNCAT_KEY = "__uncat__";

export function SectionedLineTable({
  revisionId,
  lines,
  sections,
  activeSectionId,
  onActiveSectionChange,
}: Props) {
  const { columns } = useTweaks();
  const [, start] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const visibleColCount = useMemo(() => {
    let n = 2; // # column + trash column
    if (columns.sku) n++;
    if (columns.desc) n++;
    if (columns.cat) n++;
    if (columns.vendor) n++;
    if (columns.unit) n++;
    if (columns.qty) n++;
    if (columns.price) n++;
    if (columns.total) n++;
    if (columns.stock) n++;
    return n;
  }, [columns]);

  const grouped = useMemo(() => {
    const uncat = lines.filter(l => l.sectionId === null);
    const bySection = new Map<string, Line[]>();
    for (const s of sections) bySection.set(s.id, []);
    for (const l of lines) {
      if (l.sectionId && bySection.has(l.sectionId)) {
        bySection.get(l.sectionId)!.push(l);
      }
    }
    return { uncat, bySection };
  }, [lines, sections]);

  if (lines.length === 0 && sections.length === 0) {
    return (
      <>
        <div className="px-6 py-16 text-center text-[var(--color-text-3)]">
          <div className="text-[13.5px]">No items in this BOM yet</div>
          <div className="mt-1 text-[12px]">Use the search above or add a section to start grouping items.</div>
        </div>
        <NewSectionInlineCreate
          revisionId={revisionId}
          onCreated={s => onActiveSectionChange(s.id)}
        />
      </>
    );
  }

  function handleDrop(targetSectionId: string | null, e: React.DragEvent) {
    e.preventDefault();
    setDropTarget(null);
    const lineId = e.dataTransfer.getData("text/x-bom-line-id");
    if (!lineId) return;
    const line = lines.find(l => l.id === lineId);
    if (!line) return;
    if (line.sectionId === targetSectionId) return;
    start(async () => {
      await moveLineToSection({ lineId, sectionId: targetSectionId });
    });
  }

  return (
    <>
      <div className="overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
              <Th w={32}>#</Th>
              {columns.sku && <Th>SKU / Part #</Th>}
              {columns.desc && <Th>Description</Th>}
              {columns.cat && <Th>Category</Th>}
              {columns.vendor && <Th>Vendor</Th>}
              {columns.unit && <Th>Unit</Th>}
              {columns.qty && <Th align="right">Qty</Th>}
              {columns.price && <Th align="right">Unit price</Th>}
              {columns.total && <Th align="right">Total</Th>}
              {columns.stock && <Th>Stock</Th>}
              <Th w={32} />
            </tr>
          </thead>

          {/* Uncategorized */}
          {grouped.uncat.length > 0 && (
            <SectionGroupBody
              key={UNCAT_KEY}
              header={
                <UncategorizedHeader
                  count={grouped.uncat.length}
                  collapsed={!!collapsed[UNCAT_KEY]}
                  onToggle={() => setCollapsed(c => ({ ...c, [UNCAT_KEY]: !c[UNCAT_KEY] }))}
                  visibleColCount={visibleColCount}
                  isDropTarget={dropTarget === UNCAT_KEY}
                />
              }
              isCollapsed={!!collapsed[UNCAT_KEY]}
              onDragOver={e => {
                e.preventDefault();
                setDropTarget(UNCAT_KEY);
              }}
              onDragLeave={() => setDropTarget(t => (t === UNCAT_KEY ? null : t))}
              onDrop={e => handleDrop(null, e)}
            >
              {grouped.uncat.map((l, i) => {
                return (
                  <LineRow
                    key={l.id}
                    line={l}
                    index={i + 1}
                    drafts={drafts}
                    setDrafts={setDrafts}
                    columns={columns}
                  />
                );
              })}
            </SectionGroupBody>
          )}

          {/* Named sections */}
          {sections.map(section => {
            const lineRows = grouped.bySection.get(section.id) ?? [];
            const isCollapsed = !!collapsed[section.id];
            return (
              <SectionGroupBody
                key={section.id}
                header={
                  <SectionRow
                    section={section}
                    lineCount={lineRows.length}
                    collapsed={isCollapsed}
                    isActive={activeSectionId === section.id}
                    onToggleCollapsed={() =>
                      setCollapsed(c => ({ ...c, [section.id]: !c[section.id] }))
                    }
                    onActivate={() => onActiveSectionChange(section.id)}
                    visibleColCount={visibleColCount}
                    totalSiblings={sections.length}
                  />
                }
                isCollapsed={isCollapsed}
                onDragOver={e => {
                  e.preventDefault();
                  setDropTarget(section.id);
                }}
                onDragLeave={() =>
                  setDropTarget(t => (t === section.id ? null : t))
                }
                onDrop={e => handleDrop(section.id, e)}
                isDropTarget={dropTarget === section.id}
              >
                {lineRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColCount}
                      className="px-3 py-3 text-center text-[12px] italic text-[var(--color-text-3)]"
                    >
                      No items in this section yet. {activeSectionId === section.id ? "Add items via search above, or drag a line here." : "Set this section active or drag a line here."}
                    </td>
                  </tr>
                ) : (
                  lineRows.map((l, i) => (
                    <LineRow
                      key={l.id}
                      line={l}
                      index={i + 1}
                      drafts={drafts}
                      setDrafts={setDrafts}
                      columns={columns}
                    />
                  ))
                )}
              </SectionGroupBody>
            );
          })}
        </table>
      </div>

      <NewSectionInlineCreate
        revisionId={revisionId}
        onCreated={s => onActiveSectionChange(s.id)}
      />
    </>
  );
}

function SectionGroupBody({
  header,
  children,
  isCollapsed,
  onDragOver,
  onDragLeave,
  onDrop,
  isDropTarget,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  isCollapsed: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDropTarget?: boolean;
}) {
  return (
    <tbody
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={isDropTarget ? "bg-[var(--color-accent-soft)]" : undefined}
    >
      {header}
      {!isCollapsed && children}
    </tbody>
  );
}

function UncategorizedHeader({
  count,
  collapsed,
  onToggle,
  visibleColCount,
  isDropTarget,
}: {
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  visibleColCount: number;
  isDropTarget?: boolean;
}) {
  return (
    <tr
      className={`border-b border-[var(--color-line)] bg-[var(--color-surface-2)] ${
        isDropTarget ? "ring-1 ring-inset ring-[var(--color-accent)]" : ""
      }`}
    >
      <td colSpan={visibleColCount} className="px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
            aria-label={collapsed ? "Expand Uncategorized" : "Collapse Uncategorized"}
          >
            {collapsed ? <Icon.Chevron size={14} /> : <Icon.ChevDown size={14} />}
          </button>
          <span className="text-[13px] font-semibold tracking-tight text-[var(--color-text-2)] italic">
            Uncategorized
          </span>
          <span className="rounded-full bg-[var(--color-surface-3)] px-2 py-px font-mono text-[11px] text-[var(--color-text-3)]">
            {count}
          </span>
        </div>
      </td>
    </tr>
  );
}

function LineRow({
  line: it,
  index,
  drafts,
  setDrafts,
  columns,
}: {
  line: Line;
  index: number;
  drafts: Record<string, number>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  columns: Record<ColumnKey, boolean>;
}) {
  const [, start] = useTransition();
  const qty = drafts[it.id] ?? it.qty;
  const price = Number(it.unitPriceSnapshot);
  return (
    <tr
      draggable
      onDragStart={e => {
        e.dataTransfer.setData("text/x-bom-line-id", it.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group cursor-grab border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)] active:cursor-grabbing"
    >
      <td className="px-3 py-2 text-[11px] tabular-nums text-[var(--color-text-3)]">
        {String(index).padStart(2, "0")}
      </td>
      {columns.sku && <td className="px-3 py-2 font-mono text-[11.5px]">{it.sku}</td>}
      {columns.desc && (
        <td className="px-3 py-2">
          {it.description}
          <div className="text-[11px] text-[var(--color-text-3)]">{it.manufacturer}</div>
        </td>
      )}
      {columns.cat && (
        <td className="px-3 py-2 text-[var(--color-text-3)]">
          {it.subcategoryName ?? it.categoryName ?? "—"}
        </td>
      )}
      {columns.vendor && <td className="px-3 py-2">{it.vendorName ?? "—"}</td>}
      {columns.unit && <td className="px-3 py-2 text-[var(--color-text-3)]">{it.unit}</td>}
      {columns.qty && (
        <td className="px-3 py-2 text-right">
          <Input
            className="h-7 w-16 text-right font-mono text-[12px] tabular-nums"
            type="number"
            min={0}
            value={qty}
            onChange={e =>
              setDrafts(d => ({ ...d, [it.id]: Math.max(0, Number(e.target.value) || 0) }))
            }
            onBlur={() => {
              if (qty === it.qty) return;
              start(async () => {
                await updateLineQty({ id: it.id, qty });
              });
            }}
          />
        </td>
      )}
      {columns.price && (
        <td className="px-3 py-2 text-right tabular-nums">${price.toFixed(3)}</td>
      )}
      {columns.total && (
        <td className="px-3 py-2 text-right font-medium tabular-nums">
          ${(qty * price).toFixed(2)}
        </td>
      )}
      {columns.stock && (
        <td className="px-3 py-2">
          <StockBadge state={it.stockState} />
        </td>
      )}
      <td className="px-3 py-2 text-right">
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover:opacity-100"
          onClick={() => start(async () => { await removeLine({ id: it.id }); })}
        >
          <Icon.Trash size={14} />
        </Button>
      </td>
    </tr>
  );
}

function Th({
  children,
  w,
  align = "left",
}: {
  children?: React.ReactNode;
  w?: number;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-2 text-${align} font-medium`} style={w ? { width: w } : undefined}>
      {children}
    </th>
  );
}
