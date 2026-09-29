// Every user works in Georgia. Pinning the zone keeps server-rendered times
// (the server runs in UTC) and client-rendered times identical, so the same
// event never shows two different clocks and hydration can't drift.
const TIME_ZONE = "Asia/Tbilisi";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

/** e.g. "6 Sept 2026, 21:24" */
export function formatDateTime(d: Date | string): string {
  return dateTimeFmt.format(new Date(d));
}

/** e.g. "6 Sept 2026" */
export function formatDate(d: Date | string): string {
  return dateFmt.format(new Date(d));
}

/** e.g. "just now", "25m ago", "5h ago", "3d ago"; older than two weeks falls back to the date. */
export function formatRelative(d: Date | string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(d).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(ms / 3_600_000);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 14) return `${days}d ago`;
  return formatDate(d);
}
