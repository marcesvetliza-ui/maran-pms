export const ACCOMMODATION_EDIT_ROLES = ["admin", "manager", "reception", "jefe_recepcion", "comercial"];
export const ACCOMMODATION_PERMISSION = "reservations:edit-accommodation";
export function accommodationPermission(role: string, override: boolean | null | undefined): boolean {
  return override ?? ACCOMMODATION_EDIT_ROLES.includes(role);
}
const numericFields = new Set(["baseRatePerNight", "finalRatePerNight", "totalRoomAmount", "discountValue", "nights"]);
export const accommodationFields = [
  ...numericFields, "checkInDate", "checkOutDate", "ratePlanId", "specialRateReason",
  "discountType", "nightlyPricing", "pricingScheme", "packageId",
];
export function changesAccommodation(before: Record<string, any>, patch: Record<string, any>): boolean {
  return accommodationFields.some(key => {
    if (patch[key] === undefined) return false;
    if (numericFields.has(key)) return Number(patch[key] ?? 0) !== Number(before[key] ?? 0);
    if (key === "nightlyPricing") return JSON.stringify(patch[key]) !== JSON.stringify(before[key]);
    return String(patch[key] ?? "") !== String(before[key] ?? "");
  });
}
