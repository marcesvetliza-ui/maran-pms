import { sql } from 'drizzle-orm';
import { db } from '../db';
import { normalizeToSpanishPaymentMethod } from '../payment-method';
import { groupAccountSnapshot } from './groupAccount';
import { getGroupInvoiceSnapshot } from './groupInvoiceScope';

const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const methods = new Set(['efectivo', 'transferencia', 'tarjeta_debito', 'tarjeta_credito', 'mercadopago', 'cuenta_corriente']);

/** Read-only proposal: an existing receipt documents pending room sources, never new money. */
export async function groupRoomAdvanceInvoicePreview(reservationId: string, paymentId: string) {
  const rows = (await db.execute(sql`SELECT p.*, gl.group_id FROM payments p
    JOIN group_reservation_links gl ON gl.reservation_id=p.reservation_id
    WHERE p.id=${paymentId} AND p.reservation_id=${reservationId}`)).rows as any[];
  if (rows.length !== 1) throw fail('El anticipo no pertenece a una habitación verificable de este grupo.', 404);
  const payment = rows[0];
  const method = normalizeToSpanishPaymentMethod(payment.method);
  const totalCents = Math.round(Number(payment.amount) * 100);
  if (payment.status === 'anulado' || !Number.isSafeInteger(totalCents) || totalCents <= 0) throw fail('El anticipo no está activo. Actualizá la cuenta de la habitación.');
  if (!methods.has(method)) throw fail('Este anticipo requiere revisar su liquidación original antes de facturarlo.');
  const claimed = (await db.execute(sql`SELECT id FROM sales_invoices WHERE payment_id=${paymentId} LIMIT 1`)).rows;
  if (payment.invoice_ref || claimed.length) throw fail('El anticipo ya tiene una factura o autorización pendiente. Actualizá el folio y recuperá ese comprobante.');
  if (payment.group_payment_id) {
    const parent = (await db.execute(sql`SELECT group_id,invoice_id,invoice_ref FROM group_payments WHERE id=${payment.group_payment_id}`)).rows[0] as any;
    if (!parent || parent.group_id !== payment.group_id || parent.invoice_id || parent.invoice_ref) throw fail('El recibo grupal ya tiene un comprobante o requiere revisar su vínculo fiscal.');
  }
  const account = await groupAccountSnapshot(reservationId);
  if (payment.group_payment_id && account.reviewReceipts.some(r => r.id === payment.group_payment_id)) throw fail('La distribución del recibo grupal requiere revisión antes de facturar este anticipo.');
  if (account.groupId !== payment.group_id || account.fiscalRequiresReview) throw fail('La cobertura fiscal histórica requiere revisión antes de facturar el anticipo.');
  const snapshot = await getGroupInvoiceSnapshot(account.groupId);
  const prefix = `reservation:${reservationId}:`;
  const available = snapshot.sources.filter(s => s.id.startsWith(prefix) && s.available > 0)
    .sort((a, b) => Number(b.kind === 'accommodation') - Number(a.kind === 'accommodation') || a.id.localeCompare(b.id));
  let left = totalCents;
  const sources: Array<{ id: string; label: string; amount: number }> = [];
  for (const source of available) {
    const take = Math.min(left, Math.round(source.available * 100));
    if (!take) continue;
    const id = source.kind === 'accommodation' ? 'accommodation' : source.id.slice((prefix + 'charge:').length);
    sources.push({ id, label: source.concept, amount: take / 100 });
    left -= take;
  }
  if (left) throw fail('El anticipo supera los conceptos pendientes de facturar de esta habitación. Revisá las facturas ya emitidas desde la habitación o el grupo.');
  return { groupId: account.groupId, reservationId, paymentId, amount: totalCents / 100, method,
    sources, sourceChargeAmounts: Object.fromEntries(sources.map(s => [s.id, s.amount])) };
}
