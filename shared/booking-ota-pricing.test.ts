import { expect, it } from 'vitest';
import { quoteBookingWithOta } from './booking-ota-pricing';
const own = { id: 'own', room_type_id: 'premium', currency: 'ARS', base_rate: '120000', rate_2pax: '120000' };
const ota = { id: 'ota', room_type_id: 'premium', currency: 'ARS', base_rate: '999999', rate_2pax: '999999' };
const stay = { checkIn: '2091-01-02', checkOut: '2091-01-04', adults: 2 };
const options = () => ({ ownPlan: own, ownDiscountPercent: 10, otaPlan: ota, otaSellMode: 'per_room' as const, otaEntries: [] as any[], inheritRanges: false, adjustmentPercent: -20 });
it('comparte restricciones sin heredar tarifa base OTA ni rangos con la casilla desmarcada', () => {
  const settings = { ...options(), otaEntries: [{ stay_date: stay.checkIn, rate: '100', rate_origin: 'ota_calendar' }] };
  expect(quoteBookingWithOta(stay, settings)).toMatchObject({ totalAmount: 216000, discountPercent: 10, pricingSource: 'own', inheritedNights: 0 });
});
it('hereda sólo el rango OTA, con su ajuste y sin acumular el descuento propio', () => {
  const result = quoteBookingWithOta(stay, { ...options(), inheritRanges: true,
    otaEntries: [{ stay_date: stay.checkIn, rate: '100000', rate_origin: 'ota_calendar' }] });
  expect(result).toMatchObject({ totalAmount: 188000, pricingSource: 'mixed', inheritedNights: 1, discountPercent: 0 });
  expect(result.nightlyPricing).toEqual([{ date: stay.checkIn, rateCents: 10000000, discountCents: 2000000 }, { date: '2091-01-03', rateCents: 12000000, discountCents: 1200000 }]);
});
it('permite subir el rango, conserva centavos y un detalle nocturno positivo', () => {
  const result = quoteBookingWithOta({ ...stay, checkOut: '2091-01-03' }, { ...options(), inheritRanges: true, adjustmentPercent: 5,
    otaEntries: [{ stay_date: stay.checkIn, rate: '100000.01', rate_origin: 'ota_calendar' }] });
  expect(result.totalAmount).toBe(105000.01); expect(result.nightlyPricing[0].discountCents).toBe(0);
});
it('respeta ocupación y rechaza precios de otros orígenes, incluidas copias de conversión', () => {
  const result = quoteBookingWithOta(stay, { ...options(), inheritRanges: true, otaSellMode: 'per_person',
    otaEntries: [{ stay_date: stay.checkIn, rate: '100000', occupancy_rates: { '2': '90000' }, occupancy_price_origins: { '2': 'ota_calendar' } },
      { stay_date: '2091-01-03', rate: '1', occupancy_rates: { '2': '2' }, rate_origin: 'copied' }] });
  expect(result.totalAmount).toBe(180000); expect(result.inheritedNights).toBe(1);
});
it('un rango para otra ocupación no sustituye el precio propio', () => {
  expect(quoteBookingWithOta(stay, { ...options(), inheritRanges: true, otaEntries: [{ stay_date: stay.checkIn,
    occupancy_rates: { '1': '100' }, occupancy_price_origins: { '1': 'ota_calendar' } }] }).totalAmount).toBe(216000);
});
it('convierte únicamente el precio del rango antes del ajuste', () => {
  const result = quoteBookingWithOta({ ...stay, checkOut: '2091-01-03' }, { ...options(), otaPlan: { ...ota, currency: 'USD' },
    inheritRanges: true, adjustmentPercent: -10, exchangeRate: '1545.000000', otaEntries: [{ stay_date: stay.checkIn, rate: '100', rate_origin: 'ota_calendar' }] });
  expect(result.totalAmount).toBe(139050);
});
it('no mezcla monedas si falta una cotización verificable', () => {
  expect(() => quoteBookingWithOta(stay, { ...options(), inheritRanges: true, otaPlan: { ...ota, currency: 'USD' }, otaEntries: [{ stay_date: stay.checkIn, rate: '100', rate_origin: 'ota_calendar' }] })).toThrow('cotización');
  expect(quoteBookingWithOta(stay, { ...options(), inheritRanges: false, otaPlan: { ...ota, currency: 'USD' } }).totalAmount).toBe(216000);
});
it.each(['stop_sell', 'closed_to_arrival', 'min_stay_arrival', 'min_stay_through', 'max_stay'])('aplica %s aunque no se hereden precios', field => {
  const value = field === 'max_stay' ? 1 : field.startsWith('min_') ? 3 : true;
  expect(() => quoteBookingWithOta(stay, { ...options(), otaEntries: [{ stay_date: stay.checkIn, [field]: value }] })).toThrow();
});
it('aplica el cierre de salidas del día de salida, no el stop-sell de esa noche', () => {
  expect(() => quoteBookingWithOta(stay, { ...options(), otaEntries: [{ stay_date: stay.checkOut, closed_to_departure: true }] })).toThrow('salidas');
  expect(quoteBookingWithOta(stay, { ...options(), otaEntries: [{ stay_date: stay.checkOut, stop_sell: true }] }).totalAmount).toBe(216000);
});
it('no permite porcentajes que dejen importes inválidos', () => {
  for (const adjustmentPercent of [-100, 1001, NaN, -1.001]) expect(() => quoteBookingWithOta(stay, { ...options(), adjustmentPercent })).toThrow();
});
it('conserva el redondeo del descuento propio cuando cae en medio centavo',()=>{
 const result=quoteBookingWithOta({...stay,checkOut:'2091-01-03'},{...options(),ownPlan:{...own,base_rate:'0.05',rate_2pax:'0.05'},ownDiscountPercent:10});
 expect(result.totalAmount).toBe(0.04);expect(result.nightlyPricing[0]).toMatchObject({rateCents:5,discountCents:1});
});
it('sólo toma el precio correspondiente a la modalidad OTA del plan',()=>{
 const entry={stay_date:stay.checkIn,rate:'100000',rate_origin:'ota_calendar',occupancy_rates:{'2':'80000'},occupancy_price_origins:{'2':'ota_calendar'}};
 const oneNight={...stay,checkOut:'2091-01-03'};
 expect(quoteBookingWithOta(oneNight,{...options(),inheritRanges:true,otaEntries:[entry]}).totalAmount).toBe(80000);
 expect(quoteBookingWithOta(oneNight,{...options(),inheritRanges:true,otaSellMode:'per_person',otaEntries:[entry]}).totalAmount).toBe(64000);
 expect(quoteBookingWithOta(oneNight,{...options(),inheritRanges:true,otaSellMode:'per_person',otaEntries:[{...entry,occupancy_price_origins:{}}]}).totalAmount).toBe(108000);
});
