import { z } from 'zod';

export const MAX_CALENDAR_CELLS = 5000;
export function calendarDay(value: string) {
  if (value.startsWith('0000') || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function calendarAddDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
export function calendarDays(from: string, to: string) {
  if (!calendarDay(from) || !calendarDay(to) || to < from) throw Error('Indicá un período de fechas válido');
  const days: string[] = [];
  for (let day = from; day <= to; day = calendarAddDays(day, 1)) { if (days.length === 500) throw Error('El período máximo es de 500 días'); days.push(day); if (day === to) break; }
  return days;
}
const stay = z.number().int().min(1).max(365);
export const calendarValuesSchema = z.object({
  rate: z.string().regex(/^\d{1,8}(\.\d{1,2})?$/).refine(value => Number(value) > 0).nullable().optional(),
  minStayArrival: stay.optional(), minStayThrough: stay.optional(), maxStay: z.number().int().min(0).max(365).optional(),
  stopSell: z.boolean().optional(), closedToArrival: z.boolean().optional(), closedToDeparture: z.boolean().optional(),
}).strict().refine(values => Object.keys(values).length > 0, 'Elegí al menos un campo para cambiar');
export const calendarChangeSchema = z.object({
  ratePlanIds: z.array(z.string().min(1).max(100)).min(1).max(20).refine(ids => new Set(ids).size === ids.length),
  dateFrom: z.string().refine(calendarDay), dateTo: z.string().refine(calendarDay), values: calendarValuesSchema,
}).strict();
export const calendarRequestSchema = z.object({ changes: z.array(calendarChangeSchema).min(1).max(50) }).strict();
export type CalendarValues = z.infer<typeof calendarValuesSchema>;
export type CalendarRequest = z.infer<typeof calendarRequestSchema>;
export type CalendarCell = {
  ratePlanId: string; date: string; rate: string; rateOverride: string | null; currency: string; isValidDate: boolean;
  minStayArrival: number; minStayThrough: number; maxStay: number; stopSell: boolean; closedToArrival: boolean; closedToDeparture: boolean;
};
export type CalendarSegment = { ratePlanId: string; dateFrom: string; dateTo: string; before: CalendarCell; after: CalendarCell };
export type CalendarPreview = { previewToken: string; changedCells: number; selectedCells: number; segments: CalendarSegment[] };
export const calendarDefaults = { minStayArrival: 1, minStayThrough: 1, maxStay: 0, stopSell: false, closedToArrival: false, closedToDeparture: false };
export function calendarEffective(plan: { id: string; base_rate: string; currency: string; valid_from?: string | null; valid_to?: string | null }, day: string, entry?: any): CalendarCell {
  return {
    ratePlanId: plan.id, date: day, rate: entry?.rate ?? plan.base_rate, rateOverride: entry?.rate ?? null, currency: plan.currency, isValidDate: (!plan.valid_from || day >= plan.valid_from) && (!plan.valid_to || day <= plan.valid_to),
    minStayArrival: entry?.min_stay_arrival ?? 1, minStayThrough: entry?.min_stay_through ?? 1, maxStay: entry?.max_stay ?? 0,
    stopSell: entry?.stop_sell ?? false, closedToArrival: entry?.closed_to_arrival ?? false, closedToDeparture: entry?.closed_to_departure ?? false
  };
}
export function applyCalendarValues(before: CalendarCell, values: CalendarValues, baseRate: string): CalendarCell {
  const after = { ...before, ...values, rateOverride: values.rate === undefined ? before.rateOverride : values.rate === null ? null : Number(values.rate).toFixed(2), rate: before.rate };
  after.rate = after.rateOverride ?? baseRate;
  if (after.maxStay !== 0 && after.maxStay < Math.max(after.minStayArrival, after.minStayThrough)) throw Error('La estadía máxima debe ser cero (sin límite) o al menos igual a las mínimas');
  return after;
}
/** Merge partial edits while rejecting ambiguous overlapping writes to the same field. */
export function calendarIntents(request: CalendarRequest) {
  const cells = new Map<string, { ratePlanId: string; date: string; values: CalendarValues }>();
  for (const change of request.changes) for (const day of calendarDays(change.dateFrom, change.dateTo)) for (const id of change.ratePlanIds) {
    const key = `${id}:${day}`, previous = cells.get(key), values = previous?.values ?? {};
    for (const [field, rawValue] of Object.entries(change.values)) {
      const value = field === 'rate' && typeof rawValue === 'string' ? Number(rawValue).toFixed(2) : rawValue;
      if (Object.hasOwn(values, field) && (values as any)[field] !== value) throw Error('Hay cambios incompatibles para el mismo plan y la misma noche');
      (values as any)[field] = value;
    }
    cells.set(key, { ratePlanId: id, date: day, values });
    if (cells.size > MAX_CALENDAR_CELLS) throw Error(`Cada guardado admite hasta ${MAX_CALENDAR_CELLS} noches entre todos los planes`);
  }
  return [...cells.values()].sort((a, b) => a.ratePlanId.localeCompare(b.ratePlanId) || a.date.localeCompare(b.date));
}
