"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  renameSection,
  reorderSection,
  deleteSection,
} from "@/server/actions/bom-sections";

export type SectionInfo = {
  id: string;
  name: string;
  position: number;
};

type Props = {
  section: SectionInfo;
  lineCount: number;
  collapsed: boolean;
  isActive: boolean;
  onToggleCollapsed: () => void;
  onActivate: () => void;
  visibleColCount: number;
  totalSiblings: number;
};

export function SectionRow({
  section,
  lineCount,
  collapsed,
  isActive,
  onToggleCollapsed,
  onActivate,
  visibleColCount,
  totalSiblings,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.name);
  const [, start] = useTransition();

  function commitRename() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === section.name) {
      setDraft(section.name);
      return;
    }
    start(async () => {
      await renameSection({ id: section.id, name: next });
    });
  }

  return (
    <tr
      className={`group border-b border-[var(--color-line)] bg-[var(--color-surface-2)] ${
        isActive ? "ring-1 ring-inset ring-[var(--color-accent)]" : ""
      }`}
    >
      <td colSpan={visibleColCount} className="px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
            aria-label={collapsed ? "Expand section" : "Collapse section"}
          >
            {collapsed ? <Icon.Chevron size={14} /> : <Icon.ChevDown size={14} />}
          </button>

          {editing ? (
            <Input
              autoFocus
              className="h-7 w-56 text-[13px] font-semibold"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === "Escape") {
                  setDraft(section.name);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => onActivate()}
              onDoubleClick={() => setEditing(true)}
              className="text-[13px] font-semibold tracking-tight text-[var(--color-text-1)]"
              title="Click to make active, double-click to rename"
            >
              {section.name}
            </button>
          )}

          <span className="rounded-full bg-[var(--color-surface-3)] px-2 py-px font-mono text-[11px] text-[var(--color-text-3)]">
            {lineCount}
          </span>

          {isActive && (
            <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-px text-[11px] font-medium text-[var(--color-accent)]">
              ● Active
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            {!isActive && (
              <Button variant="ghost" size="sm" onClick={onActivate}>
                Set active
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" aria-label="Section actions">
                    <Icon.More size={14} />
                  </Button>
                }
              />
              <DropdownMenuContent className="w-44">
                <DropdownMenuItem onClick={() => setEditing(true)}>
                  <Icon.Edit size={13} className="mr-2" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={section.position === 0}
                  onClick={() =>
                    start(async () => {
                      await reorderSection({ id: section.id, position: Math.max(section.position - 1, 0) });
                    })
                  }
                >
                  <Icon.ArrowLeft size={13} className="mr-2 rotate-90" /> Move up
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={section.position >= totalSiblings - 1}
                  onClick={() =>
                    start(async () => {
                      await reorderSection({ id: section.id, position: section.position + 1 });
                    })
                  }
                >
                  <Icon.ArrowRight size={13} className="mr-2 rotate-90" /> Move down
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (
                      confirm(
                        `Delete section "${section.name}"? Its ${lineCount} line(s) will be moved to Uncategorized.`,
                      )
                    ) {
                      start(async () => {
                        await deleteSection({ id: section.id, mode: "moveToUncategorized" });
                      });
                    }
                  }}
                >
                  <Icon.Trash size={13} className="mr-2" /> Delete (keep lines)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (
                      confirm(
                        `Delete section "${section.name}" AND its ${lineCount} line(s)? This cannot be undone.`,
                      )
                    ) {
                      start(async () => {
                        await deleteSection({ id: section.id, mode: "deleteLines" });
                      });
                    }
                  }}
                >
                  <Icon.Trash size={13} className="mr-2 text-[var(--color-danger)]" />
                  <span className="text-[var(--color-danger)]">Delete with lines</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </td>
    </tr>
  );
}
