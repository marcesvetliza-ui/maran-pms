export type OccupancyBasis = 'actual' | 'reserved' | 'mixed';
export type OccupancyNight = {
  date: string;
  capacity: number;
  actualNights: number;
  forecastNights: number;
};

/** Same night/status boundary as Planning's Revenue row. Capacity includes
 * every selected night, so period occupancy is weighted by room availability. */
export function lodgingOccupancy(asOf: string, days: readonly OccupancyNight[]) {
  const daily = days.map(day => {
    const basis = day.date < asOf ? 'actual' as const : 'reserved' as const;
    const countedNights = day.actualNights + (basis === 'reserved' ? day.forecastNights : 0);
    return { ...day, basis, countedNights, freeRooms: day.capacity - countedNights,
      occupancy: day.capacity > 0 ? countedNights / day.capacity * 100 : 0 };
  });
  const capacityNights = daily.reduce((sum, day) => sum + day.capacity, 0);
  const roomNights = daily.reduce((sum, day) => sum + day.countedNights, 0);
  const actualRoomNights = daily.reduce((sum, day) => sum + day.actualNights, 0);
  const hasPast = daily.some(day => day.basis === 'actual');
  const hasReserved = daily.some(day => day.basis === 'reserved');
  const basis: OccupancyBasis = hasPast && hasReserved ? 'mixed' : hasReserved ? 'reserved' : 'actual';
  return { daily, summary: { basis, roomNights, capacityNights, actualRoomNights,
    forecastRoomNights: roomNights - actualRoomNights,
    occupancy: capacityNights > 0 ? roomNights / capacityNights * 100 : 0 } };
}

export type OccupancySummary = ReturnType<typeof lodgingOccupancy>['summary'];
