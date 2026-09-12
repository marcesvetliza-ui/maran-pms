import { parseReservationRate, isZeroReservationRate } from "@shared/reservationRate";

interface WalkInRateValidation {
  usesSpecialRate: boolean;
  selectedRatePlanExists: boolean;
  effectiveNightRate: string;
  specialRateReason: string;
  specialRateAmountProvided?: boolean;
}

export function canUseWalkInRate({
  usesSpecialRate,
  selectedRatePlanExists,
  effectiveNightRate,
  specialRateReason,
  specialRateAmountProvided,
}: WalkInRateValidation): boolean {
  const parsedRate = parseReservationRate(effectiveNightRate);
  if (parsedRate === null || parsedRate < 0) return false;
  if (isZeroReservationRate(parsedRate)) {
    if (specialRateAmountProvided === false) return false;
    return specialRateReason.trim().length > 0;
  }

  if (usesSpecialRate) {
    return specialRateReason.trim().length > 0;
  }

  return selectedRatePlanExists;
}