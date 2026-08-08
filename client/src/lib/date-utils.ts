/**
 * Date utilities for Argentina timezone (America/Argentina/Buenos_Aires, UTC-3).
 *
 * Always use these helpers instead of `new Date().toISOString().split("T")[0]`
 * or inline `toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })`
 * calls — which are error-prone and scattered across the codebase.
 *
 * These functions are re-exported from `@/lib/utils` for convenience.
 */

const TZ = "America/Argentina/Buenos_Aires";

/**
 * Returns today's date in Argentina as a "YYYY-MM-DD" string.
 */
export function getArgentinaToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * Returns the first day of the current month in Argentina as "YYYY-MM-DD".
 */
export function getArgentinaFirstOfMonth(): string {
  const d = getArgentinaToday(); // "YYYY-MM-DD"
  return d.slice(0, 7) + "-01";
}

/**
 * Returns the last day of the current month in Argentina as "YYYY-MM-DD".
 */
export function getArgentinaEndOfMonth(): string {
  const d = getArgentinaToday(); // "YYYY-MM-DD"
  const [yyyy, mm] = d.split("-");
  const lastDay = new Date(parseInt(yyyy, 10), parseInt(mm, 10), 0).getDate();
  return `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`;
}

/**
 * Converts any Date object to an Argentina-timezone "YYYY-MM-DD" string.
 * Use this when you have an existing Date (e.g. from a DB timestamp) and need
 * to compare it against local Argentine date boundaries.
 */
export function toArgentinaDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}
