import { sql } from "drizzle-orm";
import { db } from "./db";

/** Archive the operational account, preserving every amount and movement.
 * The caller supplies its cancellation transaction when using an explicit tx. */
export async function archiveCancelledReservationFolio(
  reservationId: string,
  actor: string,
  executor: Pick<typeof db, "execute"> = db,
) {
  await executor.execute(sql`
    UPDATE folios f
    SET status = 'closed', closed_at = COALESCE(f.closed_at, now()),
        closed_by = COALESCE(f.closed_by, ${actor})
    WHERE f.entity_type = 'reservation' AND f.entity_id = ${reservationId}
      AND f.status = 'open'
      AND EXISTS (
        SELECT 1 FROM reservations r WHERE r.id = f.entity_id AND r.status = 'cancelled'
      )
  `);
}
