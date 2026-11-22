import { sql } from 'drizzle-orm';

/** Called inside the schedule transaction, before locking the appointment.
 * Shares lock order with fiscal settlement; cancellation never releases holds. */
export async function lockSpaAppointmentCancellation(tx: any, appointmentId: string) {
  await tx.execute(sql`SET LOCAL lock_timeout='3s'`);
  const accounts = await tx.execute(sql`SELECT id FROM spa_accounts WHERE appointment_id=${appointmentId} ORDER BY id`);
  for (const account of accounts.rows as { id: string }[]) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'funding-scope:spa:' + account.id},0))`);
  }
  if (!accounts.rows.length) return;
  const schema = await tx.execute(sql`SELECT to_regclass('payment_funding.operations') IS NOT NULL AS installed`);
  if (!schema.rows[0]?.installed) return;
  for (const account of accounts.rows as { id: string }[]) {
    const pending = await tx.execute(sql`SELECT id FROM payment_funding.operations
      WHERE scope_kind='spa' AND scope_id=${account.id} AND status NOT IN ('applied','aborted') LIMIT 1`);
    if (pending.rows.length) {
      throw Object.assign(new Error('Hay una operación financiera pendiente en la cuenta de este turno. Completá o conciliá esa operación antes de cancelar; sus cobros y reservas de fondos se conservan.'), { statusCode: 409 });
    }
  }
}
