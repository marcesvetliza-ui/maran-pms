import { formatHotelTime, HOTEL_TIME_ZONE } from "./hotelTime";

export { HOTEL_TIME_ZONE };

export function formatInvoiceCreatedTime(value: string | Date | null | undefined): string {
  return formatHotelTime(value);
}

export function isInvoiceReconciliationPending(invoice: any): boolean {
  return (invoice?.reconciliation_status ?? invoice?.reconciliationStatus) === "pendiente";
}