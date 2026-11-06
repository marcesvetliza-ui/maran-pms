import { describe, it, expect } from 'vitest';
import { calendarRequestSchema, calendarDays, calendarEffective, applyCalendarValues, calendarIntents, calendarAddDays } from '@shared/rate-calendar';
const plan = { id: 'plan', base_rate: '100.00', currency: 'USD' };
describe('daily selling calendar', () => {
  it('keeps civil dates inclusive through leap years and limits intervals', () => {
    expect(calendarDays('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    expect(() => calendarDays('2026-02-30', '2026-03-01')).toThrow();
    expect(() => calendarDays('2026-01-01', '2027-06-01')).toThrow();
  });
  it('distinguishes untouched fields from explicit false, zero and a base-rate reset', () => {
    const before = calendarEffective(plan, '2026-11-01', { rate: '140.00', stop_sell: true, max_stay: 5, min_stay_arrival: 2 });
    expect(applyCalendarValues(before, { closedToArrival: true }, plan.base_rate)).toMatchObject({ rate: '140.00', stopSell: true, maxStay: 5, closedToArrival: true });
    expect(applyCalendarValues(before, { rate: null, stopSell: false, maxStay: 0 }, plan.base_rate)).toMatchObject({ rate: '100.00', rateOverride: null, stopSell: false, maxStay: 0, minStayArrival: 2 });
  });
  it('rejects contradictory overlaps and merges different fields on overlapping nights', () => {
    const change = { ratePlanIds: ['plan'], dateFrom: '2026-11-01', dateTo: '2026-11-02', values: { rate: '150' } };
    expect(() => calendarIntents({ changes: [change, { ...change, values: { rate: '160' } }] })).toThrow('incompatibles');
    expect(calendarIntents({ changes: [change, { ...change, values: { minStayArrival: 3 } }] })).toHaveLength(2);
  });
  it('rejects empty edits, invalid money and impossible stay limits', () => {
    const change = { ratePlanIds: ['plan'], dateFrom: '2026-11-01', dateTo: '2026-11-02' };
    for (const values of [{}, { rate: '0' }, { rate: '1.234' }, { minStayThrough: 0 }, { maxStay: -1 }, { stopSell: 'true' }]) expect(calendarRequestSchema.safeParse({ changes: [{ ...change, values }] }).success).toBe(false);
    expect(() => applyCalendarValues(calendarEffective(plan, change.dateFrom), { minStayArrival: 5, maxStay: 3 }, plan.base_rate)).toThrow('máxima');
  });
  it('bounds the number of selected plan-nights before database access', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `plan-${i}`);
    expect(() => calendarIntents({ changes: [{ ratePlanIds: ids, dateFrom: '2026-11-01', dateTo: calendarAddDays('2026-11-01', 499), values: { stopSell: true } }] })).toThrow('5000');
  });
  it('treats equivalent monetary representations as the same overlapping price', () => {
    const row = { ratePlanIds: ['plan'], dateFrom: '2026-11-01', dateTo: '2026-11-01', values: { rate: '150' } };
    expect(calendarIntents({ changes: [row, { ...row, values: { rate: '150.00' } }] })[0].values.rate).toBe('150.00');
  });
  it('marks dates outside plan validity without making them sellable', () => {
    expect(calendarEffective({ ...plan, valid_to: '2026-10-31' }, '2026-11-01').isValidDate).toBe(false);
    expect(calendarEffective({ ...plan, valid_from: '2026-11-01' }, '2026-11-01').isValidDate).toBe(true);
  });

});
