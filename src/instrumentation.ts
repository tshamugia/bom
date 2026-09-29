export async function register() {
  // The reminder clock needs a long-running Node server; `next dev` recompiles
  // too eagerly for it, so there reminders are sent with "Send now" instead.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { startReminderClock } = await import("./server/lib/reminder-clock");
  startReminderClock();
}
