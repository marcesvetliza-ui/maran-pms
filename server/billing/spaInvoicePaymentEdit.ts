import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../db-storage";

const CASH_METHODS = new Set(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "mercadopago"]);
// spa_payments.method usa vocabulario en inglés, distinto del resto del
// sistema (server/routes/spa.ts, INVOICE_TO_SPA_PAYMENT_METHOD) — hay que
// traducir al guardar ahí, aunque cash_movements/sales_invoices sigan en
// español como en todos los demás circuitos.
const INVOICE_TO_SPA_PAYMENT_METHOD: Record<string, string> = {
  efectivo: "cash",
  tarjeta_debito: "debit_card",
  tarjeta_credito: "credit_card",
  transferencia: "transfer",
  mercadopago: "mercadopago",
};
const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Corrige la forma de pago de una factura de SPA (server/routes/spa.ts,
 * POST /api/spa/accounts/:id/link-invoice). A diferencia de Restaurant/
 * Eventos, ese flujo exige que la cuenta SPA no tenga pagos previos y crea
 * en la MISMA transacción el spa_payment, el cash_movement (source_type=
 * 'comprobante', source_id=invoiceId — igual convención que Centro de
 * Comprobantes y la Reserva de sub-path (b), no source_id=accountId) y el
 * pago del folio (sourceType='spa_payment', cashMovementId poblado) — por
 * eso siempre hay exactamente un pago real, sin la ambigüedad de multi-split
 * que tienen Restaurant/Eventos.
 *
 * El contraasiento del folio usa monto negativo + voidedMovementId (igual
 * que voidReservationPaymentAtomic), no el patrón de monto positivo del
 * "void" de NC en billing/routes.ts.
 *
 * Alcance acotado a propósito: solo medios reales de Caja (nada de Cuenta
 * Corriente todavía).
 */
export async function editSpaInvoiceCashMethod(invoiceId: number, newMethod: string, operator: string): Promise<any> {
  const existing = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${invoiceId} LIMIT 1`);
  const invoice = existing.rows[0] as any;
  if (!invoice) throw Object.assign(new Error("Comprobante no encontrado"), { statusCode: 404 });
  if (!invoice.spa_account_id) throw invalid("Este comprobante no está vinculado a una cuenta de SPA.");
  if (invoice.estado !== "emitida" && invoice.estado !== "parcial") throw invalid("Solo se puede editar la forma de pago de un comprobante emitido.");
  if (!CASH_METHODS.has(newMethod)) {
    throw invalid("Por ahora solo se puede cambiar entre formas de pago reales (no Cuenta Corriente) en facturas de SPA.");
  }
  const newSpaMethod = INVOICE_TO_SPA_PAYMENT_METHOD[newMethod];

  const accountId = String(invoice.spa_account_id);

  const registered = await db.execute(sql`
    SELECT id, shift_id, payment_id FROM cash_movements
    WHERE source_type = 'comprobante' AND source_id = ${String(invoiceId)} AND anulado = false
  `);
  if (registered.rows.length !== 1) {
    throw invalid("El cobro de Caja de esta factura no existe o no es unívoco — todavía no se puede editar desde acá.");
  }
  const cashRow = registered.rows[0] as any;
  if (cashRow.shift_id) {
    const shiftRow = await db.execute(sql`SELECT status FROM cash_shifts WHERE id = ${cashRow.shift_id}`);
    if ((shiftRow.rows[0] as any)?.status === "closed") {
      throw Object.assign(new Error("No se puede editar: el turno de Caja de este cobro ya está cerrado."), { statusCode: 403 });
    }
  }
  if (!cashRow.payment_id) throw invalid("El movimiento de Caja no está vinculado a un pago de SPA — todavía no se puede editar desde acá.");

  const paymentRow = await db.execute(sql`SELECT id, amount, method FROM spa_payments WHERE id = ${cashRow.payment_id} AND status = 'active'`);
  if (paymentRow.rows.length !== 1) {
    throw invalid("El pago de SPA vinculado no existe o ya no está activo — todavía no se puede editar desde acá.");
  }
  const payment = paymentRow.rows[0] as any;

  const folioRow = await db.execute(sql`SELECT id FROM folios WHERE entity_type = 'spa_account' AND entity_id = ${accountId} LIMIT 1`);
  const folio = folioRow.rows[0] as any;
  if (!folio) throw invalid("Esta cuenta de SPA no tiene folio registrado.");

  const folioPayments = await db.execute(sql`
    SELECT fm.id, fm.amount
    FROM folio_movements fm
    WHERE fm.folio_id = ${folio.id} AND fm.type = 'payment'
      AND fm.source_type = 'spa_payment' AND fm.source_id = ${payment.id}
      AND NOT EXISTS (SELECT 1 FROM folio_movements v WHERE v.voided_movement_id = fm.id AND v.type = 'void')
  `);
  if (folioPayments.rows.length !== 1) {
    throw invalid("El movimiento de pago del folio no existe o no es unívoco — todavía no se puede editar desde acá.");
  }
  const folioPayment = folioPayments.rows[0] as any;

  const total = Number(invoice.monto_total);
  const label = `${invoice.tipo_comprobante}-${String(invoice.punto_venta).padStart(4, "0")}-${String(invoice.numero).padStart(8, "0")}`;
  const shift = await storage.getOrCreateActiveTurno("spa");

  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT id FROM sales_invoices WHERE id = ${invoiceId} AND estado IN ('emitida','parcial') FOR UPDATE`);
    if (locked.rows.length !== 1) throw invalid("El comprobante ya no está disponible para editar");

    const newPayment = await tx.execute(sql`
      INSERT INTO spa_payments (id, account_id, amount, method, is_advance, created_at, status)
      VALUES (${randomUUID()}, ${accountId}, ${payment.amount}, ${newSpaMethod}, 'false', NOW(), 'active')
      RETURNING id
    `);
    const newPaymentId = (newPayment.rows[0] as any).id;
    await tx.execute(sql`
      UPDATE spa_payments SET status = 'anulado', motivo_anulacion = 'Edición de forma de pago', anulado_at = NOW()
      WHERE id = ${payment.id}
    `);

    await tx.execute(sql`
      UPDATE cash_movements SET anulado = true, motivo_anulacion = 'Edición de forma de pago', anulado_por = ${operator}, anulado_at = NOW()
      WHERE source_type = 'comprobante' AND source_id = ${String(invoiceId)} AND anulado = false
    `);
    const newCash = await tx.execute(sql`INSERT INTO cash_movements
      (id, shift_id, area, source_type, source_id, source_label, payment_method, amount, movement_type, registered_by, receipt_type, receipt_number, payment_id)
      VALUES (${randomUUID()}, ${shift.id}, 'spa', 'comprobante', ${String(invoiceId)}, ${label}, ${newMethod}, ${total.toFixed(2)},
        'income', ${operator}, ${invoice.tipo_comprobante}, nextval('cash_movements_receipt_number_seq'::regclass)::text, ${newPaymentId})
      RETURNING id`);
    const newCashId = (newCash.rows[0] as any).id;

    await tx.execute(sql`
      INSERT INTO folio_movements (folio_id, type, amount, description, voided_movement_id, void_reason, registered_by)
      VALUES (${folio.id}, 'void', ${(-Number(folioPayment.amount)).toFixed(2)}, 'Edición de forma de pago',
        ${folioPayment.id}, 'Edición de forma de pago', ${operator})
    `);
    await tx.execute(sql`
      INSERT INTO folio_movements (folio_id, type, amount, description, payment_method, source_type, source_id, cash_movement_id, registered_by)
      VALUES (${folio.id}, 'payment', ${total.toFixed(2)}, 'SPA - Factura cobrada', ${newMethod}, 'spa_payment', ${newPaymentId}, ${newCashId}, ${operator})
    `);
    await tx.execute(sql`
      UPDATE folios f SET
        total_charges = COALESCE((SELECT SUM(amount::numeric) FROM folio_movements WHERE folio_id = f.id AND type IN ('charge','transfer_in')), 0),
        total_payments = COALESCE((SELECT SUM(amount::numeric) FROM folio_movements WHERE folio_id = f.id AND type IN ('payment','advance','discount','transfer_out','void')), 0)
      WHERE f.id = ${folio.id}
    `);
    await tx.execute(sql`UPDATE folios SET balance = total_charges::numeric - total_payments::numeric WHERE id = ${folio.id}`);

    const result = await tx.execute(sql`
      UPDATE sales_invoices SET cash_forma_pago = ${newMethod}, cash_forma_pago_detalle = ${JSON.stringify([{ method: newMethod, amount: total }])}::jsonb
      WHERE id = ${invoiceId}
      RETURNING *
    `);
    return result.rows[0];
  });
}
