/** Charge annulment is not permission to void payments or fiscal documents. */
export const RESERVATION_CHARGE_VOID_ROLES = [
  "admin", "manager", "reception", "jefe_recepcion",
] as const;

export function canVoidReservationCharge(role: unknown): boolean {
  return typeof role === "string"
    && RESERVATION_CHARGE_VOID_ROLES.some(allowed => allowed === role);
}
