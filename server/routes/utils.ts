export function isReservationLocked(reservation: { status: string }): boolean {
  return reservation.status === "checked_out" || reservation.status === "cancelled";
}
