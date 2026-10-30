import { formatHotelTime, HOTEL_TIME_ZONE } from "./hotelTime";

export { HOTEL_TIME_ZONE };

export function formatInvoiceCreatedTime(value: string | Date | null | undefined): string {
  // Raw SQL timestamp-without-time-zone fields are returned as UTC wall
  // strings, unlike typed Drizzle timestamps which already carry a Z.
  // Never let the browser interpret an unzoned database timestamp as local.
  const timestamp = typeof value === "string" ? value.trim() : value;
  const utcValue = typeof timestamp === "string" &&
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/.test(timestamp)
    ? `${timestamp.replace(" ", "T")}Z`
    : timestamp;
  return formatHotelTime(utcValue);
}

export function isInvoiceReconciliationPending(invoice: any): boolean {
  return (invoice?.reconciliation_status ?? invoice?.reconciliationStatus) === "pendiente";
}