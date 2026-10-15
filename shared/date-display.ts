/** Presentation only: API payloads, database values and comparisons remain ISO. */
export const DISPLAY_TIME_ZONE = "America/Argentina/Buenos_Aires";
type DisplayDate = string | number | Date | null | undefined;
const calendarPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDisplayDate(value: DisplayDate): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string") {
    const match = calendarPattern.exec(value);
    if (match) {
      const [, year, month, day] = match;
      const date = new Date(`${value}T12:00:00Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "—";
      return `${day}/${month}/${year}`;
    }
    // Accept existing Argentine labels without parsing them as US dates.
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
      const [day, month, year] = value.split("/");
      return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: DISPLAY_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric",
  }).format(date);
}

export function formatDisplayDateTime(value: DisplayDate): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string" && calendarPattern.test(value)) return formatDisplayDate(value);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = new Intl.DateTimeFormat("es-AR", {
    timeZone: DISPLAY_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date);
  return `${formatDisplayDate(date)} ${time}`;
}
