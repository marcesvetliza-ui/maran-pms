import { sql } from "drizzle-orm";
import { db } from "./db";

// Los movimientos se asocian a la reserva a través del folio, no tienen reservation_id.
export async function countReservationExtraFolioCharges(reservationId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM folio_movements fm
    JOIN folios f ON f.id = fm.folio_id
    WHERE f.entity_type = 'reservation'
      AND f.entity_id = ${reservationId}
      AND fm.type = 'charge'
      AND (fm.source_type IS NULL OR fm.source_type NOT IN ('accommodation', 'transfer', 'transfer_reversal'))
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}
