export function buildPackagePricingPatch(totalPrice: number, nights: number) {
  const safeNights = Number.isFinite(nights) && nights > 0 ? nights : 1;
  const safeTotal = Number.isFinite(totalPrice) && totalPrice >= 0 ? totalPrice : 0;
  const ratePerNight = (safeTotal / safeNights).toFixed(2);

  return {
    ratePlanId: "",
    specialRateReason: "",
    baseRatePerNight: ratePerNight,
    finalRatePerNight: ratePerNight,
    totalRoomAmount: safeTotal.toFixed(2),
    discountType: "none" as const,
    discountValue: "0",
  };
}