"use client";

import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { previewBomImport } from "@/server/actions/bom-import";
import {
  BOM_IMPORT_COLUMNS,
  BOM_IMPORT_ERROR_LABEL,
  BOM_IMPORT_MAX_BYTES,
  BOM_IMPORT_TEMPLATE_URL,
  bomImportFailureMessage,
  type BomImportFail,
  type BomImportSummary,
} from "@/lib/schemas/bom-import";

const XLSX_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const LIST_MAX = 8;
const ERRORS_MAX = 50;

/** A picked BOM import file and its dry run. `revisionId` = importing into that draft. */
export function useBomImportFile(revisionId?: string) {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<BomImportSummary | null>(null);
  const [fail, setFail] = useState<BomImportFail | null>(null);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  function pick(next: File | null) {
    const run = ++seq.current;
    setFile(next);
    setSummary(null);
    setFail(null);
    if (!next) return;
    if (next.size > BOM_IMPORT_MAX_BYTES) {
      setFail({ ok: false, error: "too_large" });
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("file", next);
      if (revisionId) fd.set("revisionId", revisionId);
      let r: Awaited<ReturnType<typeof previewBomImport>>;
      try {
        r = await previewBomImport(fd);
      } catch {
        r = { ok: false, error: "unreadable" };
      }
      if (run !== seq.current) return;
      if (r.ok) setSummary(r.summary);
      else setFail(r);
    });
  }

  /** Shows what a refused commit sent back (rows that became invalid, a lock…). */
  function showFail(r: BomImportFail) {
    if (r.summary) setSummary(r.summary);
    else setFail(r);
  }

  const ready = !!file && !!summary && summary.errors.length === 0 && summary.lines > 0 && !pending;
  return { file, summary, fail, pending, ready, intoDraft: !!revisionId, pick, showFail, reset: () => pick(null) };
}

export type BomImportFileState = ReturnType<typeof useBomImportFile>;

export function BomImportFilePicker({
  state,
  inputId,
  onPick = state.pick,
}: {
  state: BomImportFileState;
  inputId: string;
  onPick?: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn"
          onClick={() => inputRef.current?.click()}
          disabled={state.pending}
        >
          <Icon.Upload className="ico" /> {state.file ? "Choose another file" : "Choose file"}
        </button>
        <a href={BOM_IMPORT_TEMPLATE_URL} download className="btn btn-ghost">
          <Icon.Download className="ico" /> Download template
        </a>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={XLSX_ACCEPT}
          className="sr-only"
          onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }}
        />
      </div>
      {state.file ? (
        <p className="min-w-0 text-[12.5px] [overflow-wrap:anywhere]">
          <Icon.Sheet size={13} className="mr-1 inline align-[-2px] text-[var(--color-text-3)]" />
          {state.file.name}
          {state.pending && <span className="muted"> · reading…</span>}
        </p>
      ) : (
        <p className="text-[12px] text-[var(--color-text-3)]">
          Fill the template&apos;s BOM sheet — one row per line with section, SKU and qty. SKUs the catalog
          doesn&apos;t have are added to it, so give those a description and manufacturer.
        </p>
      )}
      {state.fail && <FailNote fail={state.fail} />}
      {state.summary && <ImportPreview summary={state.summary} intoDraft={state.intoDraft} />}
    </div>
  );
}

function FailNote({ fail }: { fail: BomImportFail }) {
  return (
    <div role="alert" className="rounded-[var(--r-3)] border border-[var(--red)]/30 bg-[var(--red-soft)] px-3 py-2 text-[12.5px] text-[var(--red)]">
      {bomImportFailureMessage(fail)}
      {fail.error === "header_mismatch" && (
        <div className="mt-1 text-[12px] [overflow-wrap:anywhere]">
          Expected: <code>{(fail.expected ?? [...BOM_IMPORT_COLUMNS]).join(", ")}</code><br />
          Found: <code>{fail.found?.join(", ") || "(empty)"}</code>
        </div>
      )}
    </div>
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function ImportPreview({ summary: s, intoDraft }: { summary: BomImportSummary; intoDraft: boolean }) {
  const created = [
    s.newVendors.length > 0 && `vendors ${s.newVendors.join(", ")}`,
    s.newCategories.length > 0 && `categories ${s.newCategories.join(", ")}`,
    s.newSubcategories.length > 0 && `subcategories ${s.newSubcategories.map(p => `${p.category} › ${p.subcategory}`).join(", ")}`,
  ].filter(Boolean);

  return (
    <div className="grid gap-2.5">
      {s.lines > 0 && (
        <div className="grid gap-2 rounded-[var(--r-3)] border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3 text-[12.5px]">
          <div className="font-semibold">
            {plural(s.lines, "line")} · {plural(s.totalQty, "unit")}
            {s.sections.length > 0 && <> · {plural(s.sections.length, "section")}</>}
          </div>

          {(s.sections.length > 0 || s.unsectionedLines > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {s.sections.map(sec => (
                <span
                  key={sec.name}
                  className="inline-flex items-center gap-1 rounded-[var(--r-2)] border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[12px]"
                >
                  {sec.name} <span className="muted tabular-nums">{sec.lines}</span>
                  {intoDraft && sec.isNew && <span className="text-[var(--accent-text)]">new</span>}
                </span>
              ))}
              {s.unsectionedLines > 0 && (
                <span className="inline-flex items-center gap-1 rounded-[var(--r-2)] border border-dashed border-[var(--color-line)] px-1.5 py-0.5 text-[12px] text-[var(--color-text-3)]">
                  No section <span className="tabular-nums">{s.unsectionedLines}</span>
                </span>
              )}
            </div>
          )}

          <ul className="grid gap-1 text-[var(--color-text-2)]">
            <li>{plural(s.existingItems, "SKU")} from the catalog.</li>
            {s.newItems.length > 0 && (
              <li>
                <span className="font-medium text-[var(--color-text)]">{plural(s.newItems.length, "new SKU")}</span> will be added to the catalog:{" "}
                <span className="[overflow-wrap:anywhere]">
                  {s.newItems.slice(0, LIST_MAX).map(i => i.sku).join(", ")}
                  {s.newItems.length > LIST_MAX && ` and ${s.newItems.length - LIST_MAX} more`}
                </span>
              </li>
            )}
            {created.length > 0 && <li className="[overflow-wrap:anywhere]">Also added: {created.join("; ")}.</li>}
            {s.mergedLines > 0 && (
              <li>{plural(s.mergedLines, "SKU is", "SKUs are")} already on this draft — the file&apos;s quantity is added to {s.mergedLines === 1 ? "its line" : "their lines"}.</li>
            )}
          </ul>
        </div>
      )}

      {s.errors.length > 0 && <ErrorList errors={s.errors} />}
    </div>
  );
}

function ErrorList({ errors }: { errors: BomImportSummary["errors"] }) {
  return (
    <div role="alert" className="rounded-[var(--r-3)] border border-[var(--red)]/30 bg-[var(--red-soft)] p-3 text-[12.5px]">
      <div className="font-semibold text-[var(--red)]">
        {plural(new Set(errors.map(e => e.rowNumber)).size, "row has errors", "rows have errors")} — nothing is imported until the file is fixed.
      </div>
      <ul className="mt-1.5 grid max-h-48 gap-1 overflow-y-auto text-[var(--color-text-2)]">
        {errors.slice(0, ERRORS_MAX).map((e, i) => (
          <li key={i} className="[overflow-wrap:anywhere]">
            <span className="tabular-nums font-medium text-[var(--color-text)]">Row {e.rowNumber}</span>
            {e.sku && <> · <code>{e.sku}</code></>} — {BOM_IMPORT_ERROR_LABEL[e.reason]}
            {e.value && e.reason !== "duplicate_sku" && <span className="muted"> (“{e.value}”)</span>}
            {e.value && e.reason === "duplicate_sku" && <span className="muted"> ({e.value})</span>}
          </li>
        ))}
        {errors.length > ERRORS_MAX && <li className="muted">…and {errors.length - ERRORS_MAX} more.</li>}
      </ul>
    </div>
  );
}
