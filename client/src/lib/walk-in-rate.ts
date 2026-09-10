interface WalkInRateValidation {
  usesSpecialRate: boolean;
  selectedRatePlanExists: boolean;
  effectiveNightRate: string;
  specialRateReason: string;
}

export function canUseWalkInRate({
  usesSpecialRate,
  selectedRatePlanExists,
  effectiveNightRate,
  specialRateReason,
}: WalkInRateValidation): boolean {
  const parsedRate = Number(effectiveNightRate);
  if (!Number.isFinite(parsedRate) || parsedRate <= 0) return false;

  if (usesSpecialRate) {
    return specialRateReason.trim().length > 0;
  }

  return selectedRatePlanExists;
}