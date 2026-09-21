export const OVERDUE_THRESHOLD_DAYS = 60;

export function isOverdue(daysOverdue: number | null | undefined): boolean {
  return typeof daysOverdue === "number" && daysOverdue > OVERDUE_THRESHOLD_DAYS;
}
