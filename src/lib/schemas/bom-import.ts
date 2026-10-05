// One file format for building a BOM from a spreadsheet: the template users
// download is the file they upload. Client-safe: no server imports.

export const BOM_IMPORT_COLUMNS = [
  "section", "sku", "qty", "description", "manufacturer", "unit",
  "vendor_code", "category", "subcategory",
] as const;
export type BomImportColumn = (typeof BOM_IMPORT_COLUMNS)[number];

export const BOM_IMPORT_TEMPLATE_URL = "/api/templates/bom-import.xlsx";
export const BOM_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const BOM_IMPORT_MAX_LINES = 5000;
export const SECTION_NAME_MAX = 120;
export const SKU_MAX = 64;

export type BomImportRow = {
  rowNumber: number;
  section: string | null;
  sku: string;
  qty: number;
  description: string;
  manufacturer: string;
  unit: string;
  vendorCode: string | null;
  category: string | null;
  subcategory: string | null;
};

export type BomImportErrorReason =
  | "missing_sku"
  | "bad_qty"
  | "duplicate_sku"
  | "section_too_long"
  | "subcategory_without_category"
  | "new_sku_too_long"
  | "new_sku_missing_description"
  | "new_sku_missing_manufacturer";

export type BomImportError = {
  rowNumber: number;
  sku: string;
  reason: BomImportErrorReason;
  value?: string;
};

export const BOM_IMPORT_ERROR_LABEL: Record<BomImportErrorReason, string> = {
  missing_sku: "SKU is empty",
  bad_qty: "qty must be a whole number above 0",
  duplicate_sku: "SKU is already on an earlier row — a BOM lists each SKU once, add the quantities together",
  section_too_long: `Section name is longer than ${SECTION_NAME_MAX} characters`,
  subcategory_without_category: "Subcategory is set but category is empty",
  new_sku_too_long: `New SKU is longer than ${SKU_MAX} characters`,
  new_sku_missing_description: "New SKU — description is required to add it to the catalog",
  new_sku_missing_manufacturer: "New SKU — manufacturer is required to add it to the catalog",
};

export type BomImportSummary = {
  fileName: string;
  lines: number;
  totalQty: number;
  sections: { name: string; lines: number; isNew: boolean }[];
  unsectionedLines: number;
  existingItems: number;
  newItems: { sku: string; description: string }[];
  /** Importing into a draft: SKUs already on it, whose quantity goes up. */
  mergedLines: number;
  newVendors: string[];
  newCategories: string[];
  newSubcategories: { category: string; subcategory: string }[];
  errors: BomImportError[];
};

export type BomImportFailure =
  | "unreadable"
  | "too_large"
  | "empty"
  | "too_many_lines"
  | "header_mismatch"
  | "has_errors"
  | "name_taken"
  | "project_not_found"
  | "revision_not_found"
  | "revision_locked"
  | "db_error";

export type BomImportFail = {
  ok: false;
  error: BomImportFailure;
  expected?: string[];
  found?: string[];
  summary?: BomImportSummary;
  message?: string;
};

export type BomImportPreviewResult = { ok: true; summary: BomImportSummary } | BomImportFail;

export type BomImportCommitResult =
  | {
      ok: true;
      projectId: string;
      bomId: string;
      revisionId: string;
      lines: number;
      itemsCreated: number;
    }
  | BomImportFail;

const FAILURE_MESSAGE: Record<BomImportFailure, string> = {
  unreadable: "Couldn't read the file. Save it as .xlsx from the template and try again.",
  too_large: `The file is larger than ${BOM_IMPORT_MAX_BYTES / 1024 / 1024} MB.`,
  empty: "The file has no lines under the header row.",
  too_many_lines: `The file has more than ${BOM_IMPORT_MAX_LINES.toLocaleString("en-US")} lines.`,
  header_mismatch: "The header row doesn't match the template.",
  has_errors: "Some rows have errors. Fix them in the file and upload it again.",
  name_taken: "This project already has a BOM with that name (archived BOMs count too).",
  project_not_found: "The project no longer exists.",
  revision_not_found: "This revision no longer exists.",
  revision_locked: "This revision is committed — start a new revision to import into it.",
  db_error: "The import failed and nothing was saved.",
};

export function bomImportFailureMessage(fail: Pick<BomImportFail, "error">): string {
  return FAILURE_MESSAGE[fail.error];
}
