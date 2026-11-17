import type { AccountMovement } from "./schema";

/** Read-only reservation context; stored accounting references stay intact. */
export type AccountMovementReservationDisplay = {
  guestName: string | null;
  checkInDate: string;
  checkOutDate: string;
};
export type AccountMovementWithReservation = AccountMovement & {
  reservationDisplay?: AccountMovementReservationDisplay;
};
