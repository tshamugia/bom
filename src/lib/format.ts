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
