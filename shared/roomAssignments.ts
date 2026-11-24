/** Completed room assignments; the current assignment always uses reservation.roomId.
 * Dates are local hotel calendar dates with exclusive checkout. Prices stay on
 * the original reservation, independently of its physical room on each night. */
export type RoomAssignment = {
  roomId: string;
  roomTypeId: string;
  from: string;
  to: string;
};
export type AssignedStay = {
  roomId: string;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  roomHistory?: RoomAssignment[] | null;
};
export function roomAssignments(stay: AssignedStay): RoomAssignment[] {
  const history = stay.roomHistory || [];
  return [
    ...history,
    {
      roomId: stay.roomId,
      roomTypeId: stay.roomTypeId,
      from: history.at(-1)?.to || stay.checkInDate,
      to: stay.checkOutDate,
    },
  ].filter((s) => s.from < s.to);
}
export function assignmentOn(stay: AssignedStay, date: string) {
  return roomAssignments(stay).find((s) => s.from <= date && date < s.to);
}
export function historyAfterMove(
  stay: AssignedStay,
  date: string,
  previousPhysicalType: string,
): RoomAssignment[] {
  const from = stay.roomHistory?.at(-1)?.to || stay.checkInDate;
  if (date < from || date >= stay.checkOutDate)
    throw new Error(
      "El cambio debe estar dentro del tramo actual de la estadía.",
    );
  return [
    ...(stay.roomHistory || []),
    ...(from < date
      ? [
          {
            roomId: stay.roomId,
            roomTypeId: previousPhysicalType,
            from,
            to: date,
          },
        ]
      : []),
  ];
}
