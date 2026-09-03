export const HOTEL_TIME_ZONE = "America/Argentina/Buenos_Aires";

type TimestampValue = string | Date | null | undefined;

function parseTimestamp(value: TimestampValue): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatHotelDateTime(
  value: TimestampValue,
  options: { includeYear?: boolean; includeSeconds?: boolean } = {},
): string {
  const date = parseTimestamp(value);
  if (!date) return "—";

  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: HOTEL_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(options.includeSeconds ? { second: "2-digit" as const } : {}),
    hour12: false,
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const datePart = options.includeYear === false
    ? `${valueOf("day")}/${valueOf("month")}`
    : `${valueOf("day")}/${valueOf("month")}/${valueOf("year")}`;
  const timePart = options.includeSeconds
    ? `${valueOf("hour")}:${valueOf("minute")}:${valueOf("second")}`
    : `${valueOf("hour")}:${valueOf("minute")}`;

  return `${datePart} ${timePart}`;
}

export function formatHotelTime(value: TimestampValue): string {
  const date = parseTimestamp(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: HOTEL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}