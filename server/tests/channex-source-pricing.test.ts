import { describe, expect, it } from 'vitest';
import source from './fixtures/channex-unmapped-vat.json';
import { parseBookingRevision, revisionHash } from '../channex/bookingRevision';
import { settleBooking } from '../channex/settlement';
const fixture = () => structuredClone(source) as any;
describe('Channex original amounts with explicit VAT and an unidentified rate plan', () => {
  it('preserves the complete channel charge and its declared VAT without inventing a plan', () => {
    const raw = fixture(), hash = revisionHash(raw);
    const parsed = parseBookingRevision(raw, 'test-property');
    expect(parsed.rooms[0]).toMatchObject({ remotePlan: null, totalCents: 14204, sourceNetCents: 11739, sourceVatCents: 2465, nights: [{ date: '2026-11-28', rateCents: 14204, discountCents: 0 }] });
    expect(settleBooking(parsed, '1545.000000')[0]).toMatchObject({ totalCents: 21945180, nights: [{ rateCents: 21945180 }] });
    expect(revisionHash(raw)).toBe(hash);
  });
  it('does not add VAT twice when the daily rates already contain it', () => {
    const raw = fixture(); raw.attributes.rooms[0].days['2026-11-28'] = '142.04'; raw.attributes.rooms[0].taxes[0].is_inclusive = true;
    expect(parseBookingRevision(raw, 'test-property').rooms[0]).toMatchObject({ totalCents: 14204, sourceVatCents: 0 });
  });
  it('distributes explicit VAT over different nightly rates and preserves the total to the cent', () => {
    const raw = fixture(); raw.attributes.departure_date = '2026-11-30'; raw.attributes.amount = '363.00';
    Object.assign(raw.attributes.rooms[0], { amount: '363.00', days: { '2026-11-28': '100.00', '2026-11-29': '200.00' }, taxes: [{ type: 'Value Added Tax (VAT)', is_inclusive: false, total_price: '63.00' }] });
    expect(parseBookingRevision(raw, 'test-property').rooms[0].nights.map(n => n.rateCents)).toEqual([12100, 24200]);
    raw.attributes.departure_date = '2026-12-01'; raw.attributes.amount = '0.04';
    Object.assign(raw.attributes.rooms[0], { amount: '0.04', days: { '2026-11-28': '0.01', '2026-11-29': '0.01', '2026-11-30': '0.01' }, taxes: [{ type: 'Value Added Tax (VAT)', is_inclusive: false, total_price: '0.01' }] });
    expect(parseBookingRevision(raw, 'test-property').rooms[0].nights.map(n => n.rateCents)).toEqual([2, 1, 1]);
  });
  it.each(['absent', 'mismatch', 'unknown-tax', 'unknown-inclusion', 'negative-gap'])('keeps %s tax differences in review instead of changing the channel total', problem => {
    const raw = fixture(); const room = raw.attributes.rooms[0];
    if (problem === 'absent') delete room.taxes;
    if (problem === 'mismatch') room.taxes[0].total_price = '24.64';
    if (problem === 'unknown-tax') room.taxes[0].type = 'City tax';
    if (problem === 'unknown-inclusion') delete room.taxes[0].is_inclusive;
    if (problem === 'negative-gap') room.amount = '100.00';
    expect(() => parseBookingRevision(raw, 'test-property')).toThrow('ROOM_TAX_TOTAL_REQUIRES_REVIEW');
  });
  it('still rejects a mismatched booking grand total, even when room taxes reconcile', () => {
    const raw = fixture(); raw.attributes.amount = '142.05';
    expect(() => parseBookingRevision(raw, 'test-property')).toThrow('TOTAL_REQUIRES_REVIEW');
  });
});
