import { NextResponse, type NextRequest } from "next/server";
import { REMINDER_TOKEN_HEADER, isValidReminderToken } from "@/lib/reminder-token";
import { runDrawingReminders } from "@/server/lib/drawing-reminder-run";

/**
 * Pinged every few minutes by the in-process clock (src/instrumentation.ts).
 * Sends nothing until the configured hour, and at most once per day.
 */
export async function POST(req: NextRequest) {
  if (!isValidReminderToken(req.headers.get(REMINDER_TOKEN_HEADER))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await runDrawingReminders({ trigger: "schedule" });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[reminders] scheduled run failed", e);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
