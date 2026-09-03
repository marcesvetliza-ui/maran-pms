export const HOTEL_TIME_ZONE = "America/Argentina/Buenos_Aires";

export function formatInvoiceCreatedTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("es-AR", {
    timeZone: HOTEL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function isInvoiceReconciliationPending(invoice: any): boolean {
  return (invoice?.reconciliation_status ?? invoice?.reconciliationStatus) === "pendiente";
}