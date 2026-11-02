/** Charge annulment is not permission to void payments or fiscal documents. */
export const RESERVATION_CHARGE_VOID_ROLES = ["admin", "manager", "reception"] as const;
export const RESTAURANT_ROOM_CHARGE_VOID_ROLES = [...RESERVATION_CHARGE_VOID_ROLES, "jefe_recepcion"] as const;

export function canVoidReservationCharge(role: unknown, category?: unknown): boolean {
  return typeof role === "string" && (
    RESERVATION_CHARGE_VOID_ROLES.some(allowed => allowed === role)
    || (role === "jefe_recepcion" && category === "restaurant")
  );
}
