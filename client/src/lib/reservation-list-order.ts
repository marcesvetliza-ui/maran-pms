export type ReservationSortMode = "room" | "checkin" | "guest" | "created";

type SortableReservation = {
  checkInDate: string;
  createdAt?: string | Date | null;
  room?: { roomNumber?: string | null } | null;
  guest?: { firstName?: string | null; lastName?: string | null } | null;
};

const collator = new Intl.Collator("es-AR", { numeric: true, sensitivity: "base" });

/** Creation-date filtering always presents newest reservations first. */
export function resolveReservationSortMode(dateMode: string, selected: ReservationSortMode): ReservationSortMode {
  return dateMode === "created" ? "created" : selected;
}

export function compareReservationsByRoom(a: SortableReservation, b: SortableReservation): number {
  const roomA = a.room?.roomNumber?.trim() || null;
  const roomB = b.room?.roomNumber?.trim() || null;
  if (!roomA && !roomB) return a.checkInDate.localeCompare(b.checkInDate);
  if (!roomA) return 1;
  if (!roomB) return -1;
  return collator.compare(roomA, roomB) || a.checkInDate.localeCompare(b.checkInDate);
}

function creationTime(value: SortableReservation["createdAt"]): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function compareReservationsForList(
  mode: ReservationSortMode, a: SortableReservation, b: SortableReservation,
): number {
  if (mode === "checkin") {
    return a.checkInDate.localeCompare(b.checkInDate) || compareReservationsByRoom(a, b);
  }
  if (mode === "guest") {
    const name = (r: SortableReservation) => `${r.guest?.lastName || ""} ${r.guest?.firstName || ""}`.trim();
    return collator.compare(name(a), name(b)) || compareReservationsByRoom(a, b);
  }
  if (mode === "created") {
    const timeA = creationTime(a.createdAt);
    const timeB = creationTime(b.createdAt);
    return timeA === timeB ? compareReservationsByRoom(a, b) : timeA > timeB ? -1 : 1;
  }
  return compareReservationsByRoom(a, b);
}
