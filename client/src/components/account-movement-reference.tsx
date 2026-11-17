import { formatDisplayDate } from "@shared/date-display";
import type { AccountMovementWithReservation } from "@shared/account-movement-reference";

type Reference = Pick<AccountMovementWithReservation, "reservationDisplay" | "guestName" | "reservationCode" | "reservationId" | "reference">;
const technicalReference = /^(?:credit-operation:|RES-\d{6,}|RS-\d+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$)/i;

export function AccountMovementReference({ movement }: { movement: Reference }) {
  const reservation = movement.reservationDisplay;
  const original = movement.reservationCode || movement.reference || "";
  if (reservation) {
    const arrival = formatDisplayDate(reservation.checkInDate), departure = formatDisplayDate(reservation.checkOutDate);
    return <div className="space-y-0.5 break-words" title={original || undefined}>
      <p className="text-sm font-medium text-foreground">{reservation.guestName || movement.guestName || "Huésped sin identificar"}</p>
      <p className="text-xs text-muted-foreground">Estadía: {arrival}{departure !== arrival ? ` → ${departure}` : ""}</p>
    </div>;
  }
  // General account payments can have no single reservation. Keep meaningful
  // manual/document references, and never invent a guest for a technical ID.
  const reference = [movement.reference, movement.reservationCode].find(value => value && !technicalReference.test(value)) || "";
  return <div className="break-words" title={original || undefined}>
    {movement.guestName ? <><p className="text-sm font-medium text-foreground">{movement.guestName}</p>{reference && <p className="text-xs text-muted-foreground">{reference}</p>}</> :
      <p className="text-sm text-muted-foreground">{reference || (movement.reservationId || movement.reservationCode ? "Reserva sin datos disponibles" : original ? "Sin reserva vinculada" : "—")}</p>}
  </div>;
}
