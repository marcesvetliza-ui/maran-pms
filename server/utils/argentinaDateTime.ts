export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

type DateInput = string | number | Date;

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function asDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date value: ${String(value)}`);
  }
  return date;
}

function parts(value: DateInput): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ARGENTINA_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(asDate(value))
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, partValue]),
  );
}

export function formatArgentinaDate(value: DateInput): string {
  if (typeof value === "string") {
    const calendarDate = CALENDAR_DATE_RE.exec(value);
    if (calendarDate) {
      const [, year, month, day] = calendarDate;
      return `${day}/${month}/${year}`;
    }
  }

  const { day, month, year } = parts(value);
  return `${day}/${month}/${year}`;
}

export function formatArgentinaDateTime(value: DateInput): string {
  const { day, month, year, hour, minute } = parts(value);
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

export function formatArgentinaFilenameTimestamp(value: DateInput = new Date()): string {
  const { day, month, year, hour, minute } = parts(value);
  return `${day}_${month}_${year}_${hour}_${minute}`;
}

export function getArgentinaOperationalParts(value: DateInput = new Date()): {
  date: string;
  time: string;
  hour: number;
} {
  const { day, month, year, hour, minute } = parts(value);
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    hour: Number(hour),
  };
}

export function getArgentinaOperationalDate(value: DateInput = new Date()): string {
  return getArgentinaOperationalParts(value).date;
}

export function addArgentinaOperationalDays(value: DateInput, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError(`Days must be an integer: ${String(days)}`);
  }

  const [year, month, day] = getArgentinaOperationalDate(value).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}