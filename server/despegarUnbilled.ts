import { sql } from "drizzle-orm";
import { db } from "./db";
import type { DespegarUnbilledRow } from "../shared/despegarUnbilled";
export type { DespegarUnbilledRow } from "../shared/despegarUnbilled";

/**
 * Reservas de Despegar que ya hicieron check-out pero no tienen ninguna
 * factura vigente con importe real vinculada. Algunas quedan así a
 * propósito (tarifa en USD: no se factura hasta que llega la orden de pago
 * de Despegar, que trae la cotización promedio para pasarla a pesos) —
 * esta consulta no distingue el motivo, solo detecta "ya se fue y sigue
 * sin facturar" para que ninguna se pierda de vista, se sepa o no todavía
 * por qué. Una factura vigente a $0 (cerrada en la CC de Despegar como
 * placeholder mientras se espera la cotización real) no cuenta como
 * facturada: el problema de fondo sigue sin resolver.
 */
export async function getDespegarUnbilledCheckouts(): Promise<DespegarUnbilledRow[]> {
  const result = await db.execute(sql`
    SELECT
      r.id AS reservation_id,
      r.reservation_code,
      rm.room_number,
      COALESCE(
        g.last_name || CASE WHEN g.first_name IS NOT NULL AND g.first_name <> '' THEN ', ' || g.first_name ELSE '' END,
        'Sin huésped'
      ) AS guest_name,
      r.check_in_date,
      r.check_out_date,
      r.total_room_amount
    FROM reservations r
    JOIN rooms rm ON rm.id = r.room_id
    LEFT JOIN guests g ON g.id = r.guest_id
    LEFT JOIN agencies a ON a.id = r.agency_id
    WHERE (
      r.source = 'despegar'
      OR regexp_replace(upper(COALESCE(a.razon_social, '')), '[^A-Z0-9]', '', 'g')
        IN ('DESPEGAR', 'DESPEGARSA', 'DESPEGARCOMAR', 'DESPEGARCOMARSA')
      OR regexp_replace(upper(COALESCE(a.nombre_fantasia, '')), '[^A-Z0-9]', '', 'g')
        IN ('DESPEGAR', 'DESPEGARSA', 'DESPEGARCOMAR', 'DESPEGARCOMARSA')
    )
      AND r.status = 'checked_out'
      AND NOT EXISTS (
        SELECT 1 FROM sales_invoices si
        WHERE si.reserva_id = r.id AND si.estado <> 'anulada' AND si.monto_total > 0
      )
    ORDER BY r.check_out_date DESC, r.id
  `);
  return (result.rows as any[]).map(row => ({
    reservationId: row.reservation_id,
    reservationCode: row.reservation_code,
    roomNumber: row.room_number,
    guestName: row.guest_name,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    totalRoomAmount: row.total_room_amount !== null ? parseFloat(row.total_room_amount) : null,
  }));
}
