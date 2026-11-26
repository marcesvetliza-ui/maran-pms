import { formatDisplayDate } from "@shared/date-display";
import type { AccountMovementReferenceData } from "@shared/account-movement-reference";

const technicalReference = /^(?:credit-operation:|invoice:|\s*\{|RES-\d{6,}|RS-\d+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$)/i;
const invoiceNames: Record<string, string> = {
  FA: "Factura A", FB: "Factura B", FC: "Factura C", FT: "Factura T",
  NCA: "Nota de crédito A", NCB: "Nota de crédito B", NCC: "Nota de crédito C", NCT: "Nota de crédito T",
  NDA: "Nota de débito A", NDB: "Nota de débito B", NDC: "Nota de débito C",
};

/** Shared by the screen and printed statement; never prints an operation UUID. */
export function accountMovementReferenceLines(movement: AccountMovementReferenceData): string[] {
  const lines: string[] = [];
  const invoice = movement.invoiceDisplay;
  if (invoice) lines.push(
    `${invoiceNames[invoice.type] || invoice.type} ${String(invoice.pointOfSale).padStart(5, "0")}-${String(invoice.number).padStart(8, "0")}${invoice.status === "anulada" ? " (anulada)" : ""}`,
  );
  const reference = [movement.reference, movement.reservationCode].find(value => value && !technicalReference.test(value));
  if (reference && !invoice) lines.push(reference);
  const reservation = movement.reservationDisplay;
  if (reservation) {
    lines.push(reservation.guestName || movement.guestName || "Huésped sin identificar");
    const arrival = formatDisplayDate(reservation.checkInDate), departure = formatDisplayDate(reservation.checkOutDate);
    lines.push(`Estadía: ${arrival}${departure !== arrival ? ` → ${departure}` : ""}`);
  } else {
    if (movement.guestName) lines.push(movement.guestName);
  }
  if (!lines.length) {
    lines.push(movement.reservationId || movement.reservationCode ? "Reserva sin datos disponibles"
      : movement.reference ? "Sin reserva vinculada" : "—");
  }
  return lines;
}

export function accountMovementReferenceHtml(movement: AccountMovementReferenceData): string {
  return accountMovementReferenceLines(movement).map(line => line.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!)).join("<br/>");
}
