import { describe, it, expect } from 'vitest';
import { lodgingOccupancy } from './lodgingOccupancy';
const today = '2026-11-23';
describe('Ocupación diaria y del período', () => {
  it('cuenta reservas para una noche futura aunque aún no haya check-in', () => {
    const result = lodgingOccupancy(today, [{date:'2026-11-24',capacity:66,actualNights:0,forecastNights:58}]);
    expect(result.daily[0]).toMatchObject({basis:'reserved',countedNights:58,freeRooms:8});
    expect(result.daily[0].occupancy).toBeCloseTo(87.878787);
    expect(result.summary).toMatchObject({basis:'reserved',roomNights:58,capacityNights:66});
  });
  it('hoy incluye a los alojados y a quienes todavía van a ingresar', () => {
    expect(lodgingOccupancy(today, [{date:today,capacity:66,actualNights:19,forecastNights:3}]).daily[0].occupancy).toBeCloseTo(100/3);
  });
  it('el pasado conserva la ocupación realizada aunque reciba proyecciones inválidas', () => {
    expect(lodgingOccupancy(today,[{date:'2026-11-22',capacity:66,actualNights:14,forecastNights:30}]).daily[0]).toMatchObject({basis:'actual',countedNights:14,freeRooms:52});
  });
  it('pondera todo el período por habitaciones-noche, incluidos días sin reservas y capacidades distintas', () => {
    const result=lodgingOccupancy(today,[{date:'2026-11-22',capacity:66,actualNights:14,forecastNights:0},{date:today,capacity:66,actualNights:19,forecastNights:3},{date:'2026-11-24',capacity:65,actualNights:0,forecastNights:58},{date:'2026-11-25',capacity:66,actualNights:0,forecastNights:0}]);
    expect(result.summary).toMatchObject({basis:'mixed',roomNights:94,capacityNights:263,actualRoomNights:33,forecastRoomNights:61});
    expect(result.summary.occupancy).toBeCloseTo(94/263*100);
  });
  it('no inventa ocupación sin capacidad ni oculta discrepancias por superposición', () => {
    expect(lodgingOccupancy(today,[{date:today,capacity:0,actualNights:0,forecastNights:0}]).summary.occupancy).toBe(0);
    expect(lodgingOccupancy(today,[{date:today,capacity:1,actualNights:0,forecastNights:2}]).daily[0]).toMatchObject({occupancy:200,freeRooms:-1});
  });
  it('no modifica las cifras originales de producción o proyección', () => {
    const input=[{date:today,capacity:66,actualNights:19,forecastNights:3}];const before=structuredClone(input);lodgingOccupancy(today,input);expect(input).toEqual(before);
  });
});
