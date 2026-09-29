import { addDays } from "./drawing-reminders";

/** How far ahead the dashboard counts a deadline as upcoming. */
export const DEADLINE_WINDOW_DAYS = 14;

/** Overdue = before today; upcoming = today up to the window's end. Dates are `YYYY-MM-DD`. */
export function countDeadlines(deadlines: Array<{ date: string }>, today: string) {
  const end = addDays(today, DEADLINE_WINDOW_DAYS);
  return {
    overdue: deadlines.filter(d => d.date < today).length,
    upcoming: deadlines.filter(d => d.date >= today && d.date <= end).length,
  };
}
