// Loaded from instrumentation, outside the request graph — it only pings the
// cron route over HTTP, so all DB and mail code runs in a normal route handler.
import { REMINDER_TOKEN_HEADER, reminderToken } from "@/lib/reminder-token";

const TICK_MS = 10 * 60_000;
const FIRST_TICK_MS = 60_000;

const g = globalThis as { __drawingReminderClock?: ReturnType<typeof setInterval> };

export function startReminderClock() {
  if (g.__drawingReminderClock) return;
  const url = `http://127.0.0.1:${process.env.PORT ?? "3000"}/api/cron/drawing-reminders`;

  const tick = async () => {
    try {
      const res = await fetch(url, { method: "POST", headers: { [REMINDER_TOKEN_HEADER]: reminderToken() } });
      if (!res.ok) console.warn(`[reminders] tick returned ${res.status}`);
    } catch (e) {
      console.warn("[reminders] tick failed", e);
    }
  };

  g.__drawingReminderClock = setInterval(tick, TICK_MS);
  setTimeout(tick, FIRST_TICK_MS);
}
