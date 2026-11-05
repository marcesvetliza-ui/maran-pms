import { sql } from "drizzle-orm";

/** The parent group row is also locked by group-payment recording. Keep it
 * locked until the reservation's CC payment and receivable commit together. */
export async function lockAccountTransferGroup(tx: { execute: Function }, reservationId: string): Promise<string | null> {
  const result = await tx.execute(sql`
    SELECT g.id FROM groups g
    JOIN group_reservation_links l ON l.group_id = g.id
    WHERE l.reservation_id = ${reservationId}
    ORDER BY g.id FOR UPDATE OF g
  `);
  if (result.rows.length > 1) throw Object.assign(new Error("La reserva está vinculada a más de un grupo. Revisá sus vínculos antes de trasladar la deuda."), { statusCode: 409 });
  return result.rows[0]?.id || null;
}

export async function assertGroupAccountTransferBalance(tx: { execute: Function }, groupId: string, reservationId: string, amount: string) {
  // Fiscal NC adjustments are audit entries, not a reduction in services owed.
  const ncMarker = String.raw`\[nc:[0-9]+:[^\]]+\]`;
  const result = await tx.execute(sql`
    WITH room_balances AS (
      SELECT r.id,
        CASE WHEN COALESCE(r.total_room_amount::numeric,0) > 0 THEN r.total_room_amount::numeric
          ELSE COALESCE(r.final_rate_per_night::numeric,0) * COALESCE(r.nights,0) END AS lodging,
        COALESCE((SELECT SUM(c.amount::numeric) FROM charges c WHERE c.reservation_id = r.id
          AND c.status IS DISTINCT FROM 'anulado'
          AND NOT (c.category = 'adjustment' AND c.description ~ ${ncMarker})),0) AS extras,
        COALESCE((SELECT SUM(p.amount::numeric) FROM payments p WHERE p.reservation_id = r.id
          AND p.status IS DISTINCT FROM 'anulado'),0) AS paid,
        COALESCE((SELECT SUM(p.amount::numeric) FROM payments p WHERE p.reservation_id = r.id
          AND p.status IS DISTINCT FROM 'anulado' AND p.group_payment_id IS NULL),0) AS direct_paid
      FROM reservations r JOIN group_reservation_links l ON l.reservation_id = r.id
      WHERE l.group_id = ${groupId} AND r.status <> 'cancelled'
    )
    SELECT
      (SELECT lodging + extras - paid FROM room_balances WHERE id = ${reservationId}) AS room_balance,
      COALESCE(SUM(lodging + extras - direct_paid),0)
        + COALESCE((SELECT SUM(amount::numeric) FROM group_charges WHERE group_id = ${groupId}),0)
        - COALESCE((SELECT SUM(amount::numeric) FROM group_payments WHERE group_id = ${groupId}),0) AS group_balance
    FROM room_balances
  `);
  const row = result.rows[0];
  const cents = (value: unknown) => Math.round(Number(value) * 100);
  if (row?.room_balance == null || !Number.isFinite(cents(row.room_balance)) || !Number.isFinite(cents(row.group_balance)) ||
      cents(amount) > Math.max(0, Math.min(cents(row.room_balance), cents(row.group_balance)))) {
    throw Object.assign(new Error("El importe a trasladar supera el saldo pendiente de la habitación o del grupo. Actualizá el folio antes de continuar."), { statusCode: 409 });
  }
}
