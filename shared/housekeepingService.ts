// An occupied room is pending after automatic renewal, not merely on check-in.
export function hasDailyHousekeepingPending(
  status: string | null | undefined,
  lastService: string | null | undefined,
  today: string,
) {
  return status === "occupied" && !!lastService && lastService < today;
}
