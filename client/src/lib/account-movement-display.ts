/**
 * Los movimientos de cuenta corriente ligados a una reserva embeben el
 * código de reserva en la descripción ("Estadía RES-1788973054690-614 —
 * Hab. 903"), pisando lo único que importa leer de un vistazo. El código
 * ya viaja aparte en accountMovements.reservationCode — esto lo saca de
 * la descripción para que se muestre solo en la columna Ref.
 */
export function cleanAccountMovementDescription(
  description: string,
  reservationCode?: string | null,
): string {
  if (!reservationCode) return description;
  return description.replace(reservationCode, "").replace(/\s+/g, " ").trim();
}

// Caja no guarda el código de reserva en una columna aparte — el rótulo del
// movimiento ("Reserva RES-1788973054690-614 — Hab. 903 — Pérez, Juan — Pago
// efectivo") lo lleva embebido en un único texto libre. Sin un campo propio
// para diferenciarlo, se lo reconoce y se lo saca por patrón: el huésped y
// la habitación ya identifican el movimiento de sobra.
const LABELED_RESERVATION_CODE = /\b(Reserva|Anulaci[oó]n)\s+(RES-\d{6,}(?:-\d+)?|RS-\d+)\s*(?:—\s*)?/gi;
const BARE_RESERVATION_CODE = /\b(?:RES-\d{6,}(?:-\d+)?|RS-\d+)\b/g;

export function cleanCashMovementLabel(label: string | null | undefined): string {
  if (!label) return label ?? "";
  const cleaned = label
    .replace(LABELED_RESERVATION_CODE, "")
    .replace(BARE_RESERVATION_CODE, "")
    .replace(/\s*—\s*—\s*/g, " — ")
    .replace(/^\s*—\s*/, "")
    .replace(/\s*—\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || label;
}
