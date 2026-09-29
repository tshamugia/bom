// Shared by the Drizzle schema, server actions and client components, so this
// module must stay free of server-only and DB imports.

/** Who raised a remark against a drawing revision. */
export const REMARK_SOURCES = ["client", "site", "internal"] as const;
export type RemarkSource = (typeof REMARK_SOURCES)[number];

export const REMARK_SOURCE_LABEL: Record<RemarkSource, string> = {
  client: "Client",
  site: "Site",
  internal: "Internal",
};

/** Why a revision was issued to someone. */
export const TRANSMITTAL_PURPOSES = ["approval", "construction", "information", "comment"] as const;
export type TransmittalPurpose = (typeof TRANSMITTAL_PURPOSES)[number];

export const TRANSMITTAL_PURPOSE_LABEL: Record<TransmittalPurpose, string> = {
  approval: "For approval",
  construction: "For construction",
  information: "For information",
  comment: "For comment",
};

/** Largest single time entry — a day and a half of overtime is already suspicious. */
export const MAX_ENTRY_HOURS = 24;
export const MAX_ESTIMATE_HOURS = 10_000;

/** `12.5` → "12.5 h", `null` → "—". Trailing zeros are dropped. */
export function formatHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—";
  return `${Math.round(h * 100) / 100} h`;
}

/** Hour totals shown as numbers keep one decimal: 3.5 stays 3.5, 12.25 shows 12.3. */
export function roundHours(h: number): number {
  return Math.round(h * 10) / 10;
}

/**
 * Logged vs estimated hours as a signed percentage, e.g. 12 of 10 → +20.
 * `null` when there is no estimate to compare against.
 */
export function hoursVariancePct(logged: number, estimated: number | null): number | null {
  if (!estimated) return null;
  return Math.round(((logged - estimated) / estimated) * 100);
}
