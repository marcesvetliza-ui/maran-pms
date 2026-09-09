export type ReservationBillingTargetType = "guest" | "company" | "agency";

export function resolveReservationBillingTarget(
  payment: {
    billingTarget?: string | null;
    companyId?: string | null;
    agencyId?: string | null;
  } | null | undefined,
  reservation: {
    companyId?: string | null;
    agencyId?: string | null;
    guestId?: string | null;
    guest?: { id?: string | null } | null;
  },
): { type: ReservationBillingTargetType; id: string } | null {
  const explicitType = payment?.billingTarget;
  if (explicitType === "company" || explicitType === "agency" || explicitType === "guest") {
    const explicitId = explicitType === "company"
      ? payment?.companyId || reservation.companyId
      : explicitType === "agency"
        ? payment?.agencyId || reservation.agencyId
        : reservation.guest?.id || reservation.guestId;
    return explicitId ? { type: explicitType, id: String(explicitId) } : null;
  }
  if (reservation.companyId) return { type: "company", id: String(reservation.companyId) };
  if (reservation.agencyId) return { type: "agency", id: String(reservation.agencyId) };
  if (reservation.guestId) return { type: "guest", id: String(reservation.guestId) };
  return null;
}