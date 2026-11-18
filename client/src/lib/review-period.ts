const hotelZone = "America/Argentina/Buenos_Aires";
export function reviewToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: hotelZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
/** Calendar arithmetic on a date key; never interpret an Argentina date as local midnight. */
export function moveReviewDay(day: string, amount: number): string {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
export function reviewDayLabel(day: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: hotelZone,
    day: "numeric",
    month: "long",
  }).format(new Date(day + "T12:00:00Z"));
}
export type ReviewDayMode = "yesterday" | "today" | "custom";
export function reviewPeriod(
  mode: ReviewDayMode,
  today: string,
  from: string,
  to: string,
) {
  const date = mode === "yesterday" ? moveReviewDay(today, -1) : today;
  return mode === "custom" ? { from, to } : { from: date, to: date };
}
