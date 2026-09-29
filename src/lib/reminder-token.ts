import { createHmac, timingSafeEqual } from "node:crypto";

// Shared secret between the in-process reminder clock and the cron route.
// Derived from the auth secret so there is no extra env var to configure;
// imported from instrumentation, so it must stay free of server-only.

export const REMINDER_TOKEN_HEADER = "x-reminder-token";

export function reminderToken(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHmac("sha256", secret).update("drawing-reminders").digest("hex");
}

export function isValidReminderToken(value: string | null): boolean {
  if (!value) return false;
  const expected = Buffer.from(reminderToken());
  const given = Buffer.from(value);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
