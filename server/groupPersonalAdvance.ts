import { sql } from 'drizzle-orm';
import { voidReservationPaymentWithLedger } from './reservationPaymentVoid';

/** A transfer changes the available owner of money already received. Its
 * original receipt/Caja must never be independently reversed afterwards. */
export async function assertPersonalAdvanceNotTransferred(tx: any, paymentId: string) {
  const origin = await tx.execute(sql`SELECT group_payment_id FROM group_personal_advance_origins WHERE payment_id=${paymentId} AND status='active'`);
  if (origin.rows.length) throw Object.assign(new Error('Este anticipo fue transferido al grupo. Gestioná su anulación desde el recibo del grupo para conservar sus aplicaciones y su cobro original.'), { statusCode: 409 });
}

/** Caller holds the group/receipt transaction lock and has checked fiscal and
 * CC coverage. Reverse its real source exactly once, never invent another Caja income. */
export async function reverseTransferredPersonalAdvance(tx: any, groupId: string, groupPaymentId: string, actor: string) {
  const origins = (await tx.execute(sql`SELECT * FROM group_personal_advance_origins
    WHERE group_payment_id=${groupPaymentId} AND group_id=${groupId} AND status='active' FOR UPDATE`)).rows as any[];
  for (const origin of origins) {
    await tx.execute(sql`SELECT cs.id FROM cash_shifts cs JOIN cash_movements cm ON cm.shift_id=cs.id
      WHERE cm.payment_id=${origin.payment_id} ORDER BY cs.id FOR UPDATE OF cs`);
    const source = (await tx.execute(sql`SELECT * FROM payments WHERE id=${origin.payment_id} FOR UPDATE`)).rows[0] as any;
    if (!source || source.status !== 'anulado' || source.group_payment_id || source.reservation_id !== origin.reservation_id) throw Object.assign(new Error('El anticipo personal de origen requiere conciliación antes de anular el traspaso.'), { statusCode: 409 });
    await tx.execute(sql`UPDATE group_personal_advance_origins SET status='reversed' WHERE group_payment_id=${groupPaymentId}`);
    await tx.execute(sql`UPDATE payments SET status='active',anulado_por=null,motivo_anulacion=null,anulado_at=null WHERE id=${source.id}`);
    await voidReservationPaymentWithLedger(tx, source.id, actor, 'Anulación del anticipo transferido al grupo');
  }
}
