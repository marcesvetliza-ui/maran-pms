import { expect, it } from 'vitest';
import { calculateAgencyProduction, type AgencyProductionStay } from './agencyProduction';
const agencies: any[] = [{ id: 'a', razonSocial: 'Agencia A', nombreFantasia: 'Agencia neta', commissionRate: '0' }, { id: 'b', razonSocial: 'Agencia B', commissionRate: '10' }, { id: 'empty', razonSocial: 'Sin reservas', commissionRate: '0' }];
const stay = (extra: any = {}): AgencyProductionStay => ({ id: 'stay', agencyId: 'a', status: 'checked_out', checkInDate: '2026-10-31', checkOutDate: '2026-11-03', totalRoomAmount: '600.00', pricingScheme: 'nightly_v1', nightlyPricing: [{ date: '2026-10-31', rateCents: 10000, discountCents: 0 }, { date: '2026-11-01', rateCents: 20000, discountCents: 0 }, { date: '2026-11-02', rateCents: 30000, discountCents: 0 }], ...extra });
it('counts completed historical stays for a zero-commission agency and ranks by room nights', () => {
  const input = [stay(), stay({ id: 'other', agencyId: 'b', checkInDate: '2026-11-02', checkOutDate: '2026-11-03', totalRoomAmount: '100.01', pricingScheme: 'legacy', nightlyPricing: null })];
  const before = JSON.stringify({ agencies, input });
  const result = calculateAgencyProduction(agencies, input, { from: '2026-11-01', to: '2026-11-30' }, '2026-12-01');
  expect(result.map(r => r.agency.id)).toEqual(['a', 'b', 'empty']);
  expect(result[0]).toMatchObject({ totalReservations: 1, totalNights: 2, totalRevenue: 500, totalCommission: 0, commissionRate: 0 });
  expect(result[1]).toMatchObject({ totalNights: 1, totalRevenue: 100.01, totalCommission: 10, estimatedNights: 1 });
  expect(result[0].nightShare).toBeCloseTo(200 / 3); expect(result.reduce((s, r) => s + r.nightShare, 0)).toBeCloseTo(100);
  expect(JSON.stringify({ agencies, input })).toBe(before);
});
it('clips stays crossing month boundaries and never counts checkout as a night', () => {
  const october = calculateAgencyProduction(agencies, [stay()], { from: '2026-10-01', to: '2026-10-31' }, '2026-12-01')[0];
  const november = calculateAgencyProduction(agencies, [stay()], { from: '2026-11-01', to: '2026-11-30' }, '2026-12-01')[0];
  expect(october.totalNights).toBe(1); expect(october.totalRevenue).toBe(100); expect(november.totalRevenue).toBe(500);
  expect(calculateAgencyProduction(agencies, [stay()], { from: '2026-11-03', to: '2026-11-03' }, '2026-12-01').every(r => r.totalNights === 0)).toBe(true);
});
it.each(['confirmed', 'web_checkin', 'pending', 'tentative', 'cancelled', 'no_show', ''])('does not count an unperformed stay with status %s', status => {
  expect(calculateAgencyProduction(agencies, [stay({ status })], {}, '2026-12-01').every(r => r.totalReservations === 0)).toBe(true);
});
it('counts only elapsed nights of checked-in stays and excludes today and future nights', () => {
  const result = calculateAgencyProduction(agencies, [stay({ status: 'checked_in' })], {}, '2026-11-02')[0];
  expect(result).toMatchObject({ totalReservations: 1, totalNights: 2, totalRevenue: 300, activeReservations: 1 });
  expect(calculateAgencyProduction(agencies, [stay()], {}, '2026-10-31').every(r => r.totalNights === 0)).toBe(true);
});
it('distributes saved legacy cents exactly instead of multiplying a rounded nightly price', () => {
  const legacy = stay({ totalRoomAmount: '100.01', pricingScheme: 'legacy', nightlyPricing: null });
  const result = calculateAgencyProduction(agencies, [legacy], { from: '2026-10-31', to: '2026-11-01' }, '2026-12-01')[0];
  expect(result).toMatchObject({ totalRevenue: 66.68, totalNights: 2, estimatedNights: 2 });
});
it('retains night counts and flags unknown or inconsistent prices instead of inventing revenue', () => {
  const result = calculateAgencyProduction(agencies, [stay({ totalRoomAmount: null }), stay({ id: 'inconsistent', totalRoomAmount: '900.00' })], {}, '2026-12-01')[0];
  expect(result).toMatchObject({ totalNights: 6, totalReservations: 2, totalRevenue: 0, unpricedNights: 6 });
});
it('excludes virtual/test rooms and counts only explicit agency links', () => {
  const input = [stay({ roomIsVirtual: true }), stay({ roomNumber: 'REUB' }), stay({ floor: 99 }), stay({ agencyId: null }), stay({ agencyId: '' }), stay({ agencyId: 'unknown' })];
  expect(calculateAgencyProduction(agencies, input, {}, '2026-12-01').every(r => r.totalNights === 0)).toBe(true);
});
it('flags invalid stay dates and ignores stale stored night counts', () => {
  const result = calculateAgencyProduction(agencies, [stay({ checkInDate: '2026-02-30' }), stay({ nights: 99 })], {}, '2026-12-01')[0];
  expect(result).toMatchObject({ invalidReservations: 1, totalNights: 3, totalReservations: 1 });
});
it('keeps an agency-specific view and zero-share totals stable when no stays qualify', () => {
  const result = calculateAgencyProduction(agencies, [], { agencyId: 'b' }, '2026-12-01');
  expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ nightShare: 0, totalNights: 0 });
});
