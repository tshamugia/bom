import { z } from "zod";

export const STOCK_STATES = ["in-stock", "low-stock", "backorder", "out-of-stock"] as const;
export type StockState = (typeof STOCK_STATES)[number];

export const TEMPLATE_COLUMNS = [
  "sku", "description", "manufacturer", "unit",
  "unit_price", "on_hand", "stock_state",
  "vendor_code", "category", "subcategory",
] as const;
export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

export type ParsedRow = {
  rowNumber: number;
  sku: string;
  description: string;
  manufacturer: string;
  unit: string;
  unitPrice: number;
  onHand: number;
  stockState: StockState;
  vendorCode: string | null;
  category: string | null;
  subcategory: string | null;
};

export type RowErrorReason =
  | "missing_required"
  | "bad_type"
  | "bad_enum"
  | "bad_subcategory_without_category"
  | "subcategory_not_in_category"
  | "duplicate_in_file";

export type RowError = {
  rowNumber: number;
  sku: string;
  reason: RowErrorReason;
  field?: string;
  value?: string;
};

export type ParserResult =
  | { ok: true; rows: ParsedRow[]; rowErrors: RowError[] }
  | { ok: false; error: "header_mismatch"; expected: string[]; found: string[] }
  | { ok: false; error: "unreadable" };

export type ValidatorContext = {
  existingSkus: Set<string>;
  existingVendorCodes: Set<string>;
  existingCategories: Map<string, Set<string>>;
};

export type DryRunResult = {
  importId: string;
  fileName: string;
  counts: { total: number; toAdd: number; toUpdate: number; errored: number };
  errorRows: RowError[];
  newVendors: string[];
  newCategories: string[];
  newSubcategories: { category: string; subcategory: string }[];
  existingSkusInFile: string[];
};

export const DuplicatePolicy = z.enum(["skip", "update"]);
export type DuplicatePolicy = z.infer<typeof DuplicatePolicy>;

export type CommitOk = {
  ok: true;
  counts: { added: number; updated: number; skipped: number; errored: number };
  vendorsCreated: number;
  categoriesCreated: number;
  subcategoriesCreated: number;
  errorsFileUrl: string | null;
};
export type CommitErr = {
  ok: false;
  error: "expired" | "header_mismatch" | "unreadable" | "db_error" | "unauthorized";
  message?: string;
};
export type CommitResult = CommitOk | CommitErr;

export type PrepareOk = { ok: true; result: DryRunResult };
export type PrepareErr =
  | { ok: false; error: "header_mismatch"; expected: string[]; found: string[] }
  | { ok: false; error: "unreadable" }
  | { ok: false; error: "too_large" }
  | { ok: false; error: "unauthorized" };
export type PrepareResult = PrepareOk | PrepareErr;
