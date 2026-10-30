import { describe, it, expect, vi } from 'vitest';
import { addDays, daysBetween, compressValues, retryDelay } from '../channex/ari';
import { dispatchChannexAri } from '../channex/ariWorker';
describe('Channex ARI boundaries', () => {
  it('uses inclusive civil days across leap dates and bounds every batch at 500 days', () => {
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
  it('honors Retry-After seconds and dates and backs off across failures', () => {
    expect(retryDelay(0, '120', 0, () => 0)).toBe(120000);
    expect(retryDelay(0, 'Thu, 01 Jan 1970 00:02:00 GMT', 0, () => 0)).toBe(120000);
    expect(retryDelay(3, null, 0, () => 0)).toBe(40000);
  });
  it('never reads the database or sends externally when disabled', async () => {
    const pool = { connect: vi.fn() }, send = vi.fn();
    expect(await dispatchChannexAri(pool as any, send, false)).toEqual({ state: 'disabled' });
    expect(pool.connect).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
});
