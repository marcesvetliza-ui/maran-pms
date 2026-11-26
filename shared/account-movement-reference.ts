import type { AccountMovement } from "./schema";

/** Read-only reservation context; stored accounting references stay intact. */
export type AccountMovementReservationDisplay = {
  guestName: string | null;
  checkInDate: string;
  checkOutDate: string;
};
export type AccountMovementWithReservation = AccountMovement & {
  reservationDisplay?: AccountMovementReservationDisplay;
  invoiceDisplay?: AccountMovementInvoiceDisplay;
};

/** Display metadata only. Never replaces the ledger's durable reference. */
export type AccountMovementInvoiceDisplay = {
  id: number;
  type: string;
  pointOfSale: number;
  number: number;
  status: string;
};

export type AccountMovementReferenceData = {
  reservationDisplay?: AccountMovementReservationDisplay;
  invoiceDisplay?: AccountMovementInvoiceDisplay;
  guestName?: string | null;
  reservationCode?: string | null;
  reservationId?: string | null;
  reference?: string | null;
};
