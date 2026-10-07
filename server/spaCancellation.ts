import { sql } from 'drizzle-orm';
import { db, withDatabaseTransaction } from './db';
import { storage } from './db-storage';
import { auditLogs, cashMovements, spaPayments } from '@shared/schema';
import { eq } from 'drizzle-orm';

function fail(message: string, statusCode = 409): never { throw Object.assign(new Error(message), { statusCode }); }
export async function voidSpaPayment(id: string, reason: string, user: any, ip?: string) {
  if (!reason?.trim()) fail('El motivo de anulación es requerido', 400);
  return withDatabaseTransaction(async () => {
    const lookup = await db.execute(sql`SELECT account_id FROM spa_payments WHERE id=${id}`);
    if (!lookup.rows.length) fail('Pago no encontrado', 404);
    const accountId = (lookup.rows[0] as any).account_id;
    const accounts = await db.execute(sql`SELECT * FROM spa_accounts WHERE id=${accountId} FOR UPDATE`);
    if (!accounts.rows.length) fail('Cuenta no encontrada', 404);
    const account = accounts.rows[0] as any;
    if (account.status === 'closed' || account.invoice_id) fail('La cuenta cerrada o facturada requiere el procedimiento de reversión correspondiente', 403);
    const rows = await db.execute(sql`SELECT * FROM spa_payments WHERE id=${id} FOR UPDATE`);
    const payment = rows.rows[0] as any;
    if (payment.status === 'anulado') fail('El pago ya está anulado', 400);
    if (payment.method === 'room_charge') fail('El cargo a habitación debe revertirse desde el folio de la habitación');
    let movements = await db.execute(sql`SELECT * FROM cash_movements WHERE area='spa' AND payment_id=${id}`);
    if (!movements.rows.length) {
      const candidates = await db.execute(sql`SELECT * FROM cash_movements WHERE area='spa'
        AND source_type='spa_account' AND source_id=${accountId} AND payment_id IS NULL
        AND amount=${payment.amount}::numeric AND payment_method=${payment.method} AND anulado=false`);
      const siblings = await db.execute(sql`SELECT count(*)::int AS n FROM spa_payments WHERE account_id=${accountId}
        AND amount=${payment.amount}::numeric AND method=${payment.method} AND status='active'`);
      if (candidates.rows.length > 1 || (candidates.rows.length && (siblings.rows[0] as any).n !== 1)) fail('No se puede identificar unívocamente el movimiento de caja histórico');
      movements = candidates;
    }
    if (!movements.rows.length && !["gift_voucher", "cuenta_corriente"].includes(payment.method)) fail("Este pago no tiene un movimiento de caja identificable; requiere conciliación antes de anular");
    for (const movement of movements.rows as any[]) {
      if (movement.shift_id) {
        const shifts = await db.execute(sql`SELECT status FROM cash_shifts WHERE id=${movement.shift_id} FOR UPDATE`);
        if ((shifts.rows[0] as any)?.status !== 'open') fail('No se puede anular un cobro de una caja cerrada', 403);
      }
    }
    const operator = user?.fullName || user?.username || user?.id || 'Sistema';
    if (payment.method === 'gift_voucher' && payment.voucher_id) {
      const applications = (await storage.getGiftVoucherApplicationsForTarget('spa_account', accountId)).filter(a => a.voucherId === payment.voucher_id && a.status !== 'liberado');
      if (applications.length !== 1 || applications[0].status !== 'reservado' || Number(applications[0].amount) !== Number(payment.amount)) fail('El voucher requiere conciliación o su procedimiento de reversión');
      const voucherPayments = await db.execute(sql`SELECT count(*)::int AS n FROM spa_payments WHERE account_id=${accountId} AND voucher_id=${payment.voucher_id} AND status='active'`);
      if ((voucherPayments.rows[0] as any).n !== 1) fail('El voucher está asociado a varios pagos y requiere conciliación');
      await storage.releaseGiftVoucherApplication(applications[0].id, operator, `Anulación SPA: ${reason}`);
    }
    const folios = await db.execute(sql`SELECT id FROM folios WHERE entity_type='spa_account' AND entity_id=${accountId} FOR UPDATE`);
    for (const folio of folios.rows as any[]) {
      const original = await db.execute(sql`SELECT id, amount FROM folio_movements WHERE folio_id=${folio.id}
        AND type='payment' AND source_type='spa_payment' AND source_id=${id}`);
      for (const mov of original.rows as any[]) await storage.addFolioAdjustment(folio.id, 'void', -Math.abs(Number(mov.amount)), `Anulación pago SPA — ${reason}`, operator, mov.id, reason);
    }
    for (const movement of movements.rows as any[]) await db.update(cashMovements).set({anulado:true, motivoAnulacion:reason.trim(), anuladoPor:operator, anuladoAt:new Date(), paymentId:id}).where(eq(cashMovements.id,movement.id));
    const [updated] = await db.update(spaPayments).set({status:'anulado', motivoAnulacion:reason.trim(), anuladoAt:new Date()}).where(eq(spaPayments.id,id)).returning();
    await db.insert(auditLogs).values({userId:user?.id, userName:operator, action:'update', module:'spa', entityType:'spa_payment', entityId:id, description:`Pago SPA anulado: ${reason.trim()}`, details:JSON.stringify({accountId, amount:payment.amount, cashMovementIds:movements.rows.map((m:any)=>m.id)}), ipAddress:ip, timestamp:new Date()});
    return updated;
  });
}
