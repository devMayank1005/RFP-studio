/**
 * Dates as the business sees them: calendar days in India, never wall-clock
 * arithmetic on Date objects. Due dates are `YYYY-MM-DD` strings (the
 * database `date` type) and stay strings until they are formatted, so a
 * server render and a client render can never disagree on the day.
 */

const KOLKATA = "Asia/Kolkata";

/** Today's calendar date in India as `YYYY-MM-DD`. */
export function todayInKolkata(now: Date = new Date()): string {
  // en-CA gives ISO order; the timeZone option does the rollover correctly.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KOLKATA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtcMidnight(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Calendar days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / 86_400_000);
}

export type DueUrgency = "overdue" | "soon" | "later" | "none";

/** What to say about a due date given the days until it (negative when past); null means the RFP has none. */
export function dueLabel(days: number | null): { text: string; urgency: DueUrgency } {
  if (days === null) return { text: "No due date", urgency: "none" };
  if (days < 0) {
    const n = -days;
    return { text: `Overdue by ${n} ${n === 1 ? "day" : "days"}`, urgency: "overdue" };
  }
  if (days === 0) return { text: "Due today", urgency: "soon" };
  if (days === 1) return { text: "Due tomorrow", urgency: "soon" };
  if (days <= 7) return { text: `Due in ${days} days`, urgency: "soon" };
  return { text: `Due in ${days} days`, urgency: "later" };
}

/** `2026-10-09` → `9 Oct 2026`. Formats the date parts directly, so no timezone can shift the day. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(Date.UTC(y, m - 1, 1));
  return `${d} ${month} ${y}`;
}

/** Relative wording for timestamps ("3 min ago", "yesterday"); pass `now` from the server for stable output. */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} mo ago` : `${Math.round(months / 12)} y ago`;
}
