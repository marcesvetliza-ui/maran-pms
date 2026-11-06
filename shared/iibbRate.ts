/** Effective percentage of the entered pesos over the same base saved in the retention. */
export function iibbRateFromAmount(base: number, retained: number): number {
  if (!Number.isFinite(base) || !Number.isFinite(retained) || base <= 0 || retained <= 0) return 0;
  return Math.round((retained / base) * 100 * 10000) / 10000;
}
