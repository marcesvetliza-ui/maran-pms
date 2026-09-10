/**
 * Availability is interval-based. A room's housekeeping status describes its
 * current state, not whether it can be sold for a future stay.
 */
export const ACTIVE_ROOM_RESERVATION_STATUSES = [
  "tentative",
  "pending",
  "reserved",
  "confirmed",
  "web_checkin",
  "checked_in",
] as const;

export function intervalsOverlap(
  checkIn: string,
  checkOut: string,
  otherCheckIn: string,
  otherCheckOut: string,
): boolean {
  return otherCheckIn < checkOut && otherCheckOut > checkIn;
}

/** Room types are compared exclusively by their persisted room_type_id. */
export function hasCanonicalRoomType(
  room: { roomTypeId: string },
  roomTypeId: string,
): boolean {
  return room.roomTypeId === roomTypeId;
}

export function isOperationalInventoryRoom(room: {
  roomNumber?: string | null;
  isActive?: boolean | null;
  isVirtual?: boolean | null;
}): boolean {
  return room.roomNumber !== "REUB" && room.isVirtual !== true && room.isActive !== false;
}

export function isRoomAvailableForInterval(input: {
  room: { id: string; status: string; roomNumber?: string | null; isActive?: boolean | null; isVirtual?: boolean | null };
  checkIn: string;
  checkOut: string;
  reservations: Array<{ id: string; roomId: string; status: string; checkInDate: string; checkOutDate: string }>;
  maintenanceBlocks: Array<{ roomId: string; blockFrom: string; blockTo: string }>;
  excludedReservationIds?: ReadonlySet<string>;
}): boolean {
  const { room, checkIn, checkOut, reservations, maintenanceBlocks, excludedReservationIds } = input;
  if (!isOperationalInventoryRoom(room) || room.status === "maintenance" || room.status === "oos") return false;

  const hasReservationConflict = reservations.some((reservation) =>
    reservation.roomId === room.id &&
    ACTIVE_ROOM_RESERVATION_STATUSES.includes(reservation.status as typeof ACTIVE_ROOM_RESERVATION_STATUSES[number]) &&
    !excludedReservationIds?.has(reservation.id) &&
    intervalsOverlap(checkIn, checkOut, reservation.checkInDate, reservation.checkOutDate),
  );
  if (hasReservationConflict) return false;

  return !maintenanceBlocks.some((block) =>
    block.roomId === room.id &&
    intervalsOverlap(checkIn, checkOut, block.blockFrom, block.blockTo),
  );
}