import { describe, it, expect, vi } from 'vitest';
import { addDays, daysBetween, compressValues, ariDelta, retryDelay, ARI_CALL_INTERVAL_MS } from '../channex/ari';
import { dispatchChannexAri } from '../channex/ariWorker';
describe('Channex ARI boundaries', () => {
  it('uses inclusive civil days across leap dates and bounds each interval at 500 days', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    expect(daysBetween('2026-11-01', addDays('2026-11-01', 499))).toHaveLength(500);
    expect(() => daysBetween('2026-11-01', addDays('2026-11-01', 500))).toThrow();
    expect(() => daysBetween('2026-02-30', '2026-03-01')).toThrow();
  });
  it('compresses identical adjacent days without bridging a gap, room or changed value', () => {
    const value = (date: string, availability: number, room = 'twin') => ({ property_id: 'hotel', room_type_id: room, date_from: date, date_to: date, availability });
    expect(compressValues([value('2026-11-01', 3), value('2026-11-02', 3), value('2026-11-03', 2), value('2026-11-05', 2), value('2026-11-06', 2, 'double')])).toEqual([
      { ...value('2026-11-01', 3), date_to: '2026-11-02' }, value('2026-11-03', 2), value('2026-11-05', 2), value('2026-11-06', 2, 'double')]);
  });
  it('does not recompress adjacent calendar chunks into a range longer than 500 days', () => {
    const start = '2027-01-01';
    const rows = Array.from({ length: 1001 }, (_, i) => ({ property_id:'p',rate_plan_id:'r',rate:'123.00',date_from:addDays(start,i),date_to:addDays(start,i) }));
    const compressed = compressValues(rows);
    expect(compressed).toHaveLength(3);
    expect(compressed.map(row => daysBetween(row.date_from,row.date_to).length)).toEqual([500,500,1]);
  });
  it('emits only edited fields, preserves false/zero, and sends minimum stays as a pair', () => {
    const before = { property_id:'p',rate_plan_id:'r',date_from:'2027-01-01',date_to:'2027-01-01',rate:'100.00',stop_sell:true,max_stay:5,min_stay_arrival:1,min_stay_through:1 };
    expect(ariDelta({...before,rate:'200.00'},before)).toEqual({property_id:'p',rate_plan_id:'r',date_from:before.date_from,date_to:before.date_to,rate:'200.00'});
    expect(ariDelta({...before,stop_sell:false,max_stay:0},before)).toMatchObject({stop_sell:false,max_stay:0});
    expect(ariDelta({...before,min_stay_arrival:3,min_stay_through:3},before,['min_stay_arrival'])).toMatchObject({min_stay_arrival:3,min_stay_through:3});
    expect(ariDelta(before,before)).toBeNull();
    expect(Object.keys(ariDelta(before,undefined,['rate'])!).sort()).toEqual(['date_from','date_to','property_id','rate','rate_plan_id']);
    expect(ariDelta(before,before,['rate'],true)).toEqual(before);
  });
  it('honors Retry-After seconds and dates and backs off across failures', () => {
    expect(retryDelay(0, '120', 0, () => 0)).toBe(120000);
    expect(retryDelay(0, 'Thu, 01 Jan 1970 00:02:00 GMT', 0, () => 0)).toBe(120000);
    expect(retryDelay(3, null, 0, () => 0)).toBe(480000);
  });
  it('stays within the per-endpoint quota even for a burst of one request kind', () => {
    const requests = Array.from({ length: 30 }, (_, i) => i * ARI_CALL_INTERVAL_MS);
    for (const start of requests) expect(requests.filter(t => t >= start && t < start + 60000).length).toBeLessThanOrEqual(10);
    expect(retryDelay(0, null, 0, () => 0)).toBe(60000);
    expect(retryDelay(1, '5', 0, () => 0)).toBe(120000);
  });
  it('never reads the database or sends externally when disabled', async () => {
    const pool = { connect: vi.fn() }, send = vi.fn();
    expect(await dispatchChannexAri(pool as any, send, false)).toEqual({ state: 'disabled' });
    expect(pool.connect).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
});
