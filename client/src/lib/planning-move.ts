/** Move by the distance between the grabbed and dropped calendar cells.
 * A continuation night (including a stay clipped by the visible range) is
 * an anchor, not a new arrival date. UTC arithmetic avoids DST offsets. */
export function planningMoveDates(checkIn: string, checkOut: string, fromDay: string, toDay?: string) {
  const offset = toDay ? Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86400000) : 0;
  const shift = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  return { checkIn: shift(checkIn), checkOut: shift(checkOut), dateChanged: offset !== 0 };
}
