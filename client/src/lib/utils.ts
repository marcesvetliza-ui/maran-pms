import { formatDisplayDate } from "@shared/date-display";
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getArgentinaToday, toArgentinaDateStr } from "@/lib/date-utils"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtMoney(value: number | string | null | undefined, decimals = 2): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (isNaN(n)) return "0,00";
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Re-exported from date-utils — canonical implementation lives there.
export { getArgentinaToday, toArgentinaDateStr };

/** @deprecated Use getArgentinaToday() instead */
export const getLocalToday = getArgentinaToday;

export function formatDateAR(dateStr: string | null | undefined): string {
  return formatDisplayDate(dateStr);
}

export function folioDateSortValue(value: string | Date | null | undefined): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const dateOnly = value.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)?.[1];
  return new Date(dateOnly && value.length === 10 ? `${dateOnly}T12:00:00` : value).getTime();
}

export function formatFolioDateAR(value: string | Date | null | undefined): string {
  return formatDisplayDate(value);
}
