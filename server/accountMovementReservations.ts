import { sql, type SQL } from "drizzle-orm";
import type { AccountMovementReservationDisplay } from "@shared/account-movement-reference";

type Executor = { execute: (query: SQL) => Promise<any> };
type Movement = { id: string; reservationId?: string | null; paymentId?: string | null };

/** One batch read, using durable links rather than matching names or amounts.
 * This is presentation enrichment only: never replace references used by
 * reconciliation, receipt correction, or payment idempotency.
 */
export async function enrichAccountMovementReservations<T extends Movement>(tx: Executor, movements: T[]): Promise<Array<T & { reservationDisplay?: AccountMovementReservationDisplay }>> {
  const ids = movements.filter(movement => movement.reservationId || movement.paymentId).map(movement => movement.id);
  if (!ids.length) return movements;
  const rows = (await tx.execute(sql`
    SELECT m.id, r.check_in_date AS "checkInDate", r.check_out_date AS "checkOutDate",
      NULLIF(CONCAT_WS(', ',NULLIF(BTRIM(g.last_name),''),NULLIF(BTRIM(g.first_name),'')),'') AS "guestName"
    FROM account_movements m
    LEFT JOIN payments p ON p.id=m.payment_id AND m.reservation_id IS NULL
    JOIN reservations r ON r.id=COALESCE(m.reservation_id,p.reservation_id)
    LEFT JOIN guests g ON g.id=r.guest_id
    WHERE m.id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
  `)).rows;
  const byMovement = new Map<string, AccountMovementReservationDisplay>(rows.map((row: any) => [row.id, {
    guestName: row.guestName, checkInDate: row.checkInDate, checkOutDate: row.checkOutDate,
  }]));
  return movements.map(movement => {
    const reservationDisplay = byMovement.get(movement.id);
    return reservationDisplay ? { ...movement, reservationDisplay } : movement;
  });
}
