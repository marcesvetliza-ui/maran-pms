import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import { db } from './db';
const reviewed = new AsyncLocalStorage<string>();
export const withReviewedGroupGuestReplacement = <T>(reservationId: string, run: () => Promise<T>) => reviewed.run(reservationId, run);
/** Shared row lock prevents a delayed legacy charge/payment from landing on
 * an assignment while its contract is being moved to the replacement slot. */
export async function lockGroupAssignmentFinancialWriter(reservationId: string) {
  await db.execute(sql`SELECT id FROM reservations WHERE id=${reservationId} FOR UPDATE`);
  const released = await db.execute(sql`SELECT replacement_id FROM group_assignment_releases WHERE reservation_id=${reservationId}`);
  if (released.rows.length) throw Object.assign(new Error('Esta asignación fue liberada. Actualizá el grupo y registrá el movimiento en su reserva de reemplazo.'), { statusCode: 409 });
}
export async function guardGroupGuestReplacement(existing: { id: string; guestId: string; status: string }, newGuestId?: string) {
  if (!newGuestId || newGuestId === existing.guestId) return;
  const links = (await db.execute(sql`SELECT gl.group_id,g.codigo FROM group_reservation_links gl LEFT JOIN guests g ON g.id=${existing.guestId} WHERE gl.reservation_id=${existing.id}`)).rows as any[];
  if (!links.length) return;
  if (!['confirmed','pending','tentative'].includes(existing.status)) throw Object.assign(new Error('El pasajero del grupo solo puede reemplazarse antes del check-in.'), { statusCode: 409 });
  if (links.length !== 1 || (links[0].codigo !== `GROUP-${links[0].group_id}` && reviewed.getStore() !== existing.id)) throw Object.assign(new Error('Usá Reemplazar huésped desde Grupos para revisar los anticipos antes de cambiar al pasajero.'), { statusCode: 409 });
  if (reviewed.getStore() !== existing.id) {
    const personal = await db.execute(sql`SELECT id FROM payments WHERE reservation_id=${existing.id} AND group_payment_id IS NULL AND status<>'anulado' LIMIT 1`);
    if (personal.rows.length) throw Object.assign(new Error('Este cupo tiene un anticipo personal. Usá Asignar huésped desde Grupos para confirmar expresamente su destino.'), { statusCode: 409 });
  }
}
