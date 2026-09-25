import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../db-storage";

const CASH_METHODS = new Set(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "mercadopago"]);
const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Corrige la forma de pago de la factura de un Evento (server/routes/events.ts,
 * cierre de evento). A diferencia de Recepción/Restaurant, el pago de un
 * evento se registra ANTES de facturar (uno o varios event_payments a lo
 * largo de la organización del evento) — POST /api/events/:eventId/close
 * solo emite el comprobante sobre los pagos ya existentes, no crea ningún
 * cash_movement ni folio_movements nuevo. Además el vínculo factura↔evento
 * es al revés que en Restaurant: no hay event_id en sales_invoices, hay
 * invoice_id en events.
 *
 * cash_movements de eventos usa siempre source_id=eventId (nunca el id del
 * event_payment individual — igual ambigüedad que en Restaurant con
 * paymentSplits), así que solo se puede editar con seguridad cuando hay
 * exactamente UN event_payment activo con un medio real de Caja. El pago del
 * folio sí tiene sourceId=event_payment.id (addFolioPayment en events.ts),
 * así que ahí no hay ambigüedad — igual se exige 1 para simplificar.
 *
 * El contraasiento del folio usa monto negativo + voidedMovementId (igual
 * que voidReservationPaymentAtomic y la anulación de pago de evento que ya
 * existe en events.ts, PATCH /api/events/:eventId/payments/:payId/anular),
 * no el patrón de monto positivo del "void" de NC en billing/routes.ts.
 *
 * Alcance acotado a propósito: solo eventos con UN único pago activo, con un
 * medio real de Caja (nada de Cuenta Corriente, Cuenta de Habitación, ni
 * "Evento por Mesa" — event_tables es un circuito aparte).
 */
export async function editEventInvoiceCashMethod(invoiceId: number, newMethod: string, operator: string): Promise<any> {
  const existing = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${invoiceId} LIMIT 1`);
  const invoice = existing.rows[0] as any;
  if (!invoice) throw Object.assign(new Error("Comprobante no encontrado"), { statusCode: 404 });
  if (invoice.estado !== "emitida" && invoice.estado !== "parcial") throw invalid("Solo se puede editar la forma de pago de un comprobante emitido.");
  if (!CASH_METHODS.has(newMethod)) {
    throw invalid("Por ahora solo se puede cambiar entre formas de pago reales (no Cuenta Corriente ni Cuenta de Habitación) en facturas de Evento.");
  }

  const eventRow = await db.execute(sql`SELECT id FROM events WHERE invoice_id = ${invoiceId} LIMIT 1`);
  const event = eventRow.rows[0] as any;
  if (!event) throw invalid("Este comprobante no está vinculado a un Evento.");
  const eventId = String(event.id);

  const activePayments = await db.execute(sql`
    SELECT id, amount, method FROM event_payments WHERE event_id = ${eventId} AND status = 'active'
  `);
  if (activePayments.rows.length === 0) {
    throw invalid("Este evento no tiene un pago activo para editar.");
  }
  if (activePayments.rows.length > 1) {
    throw invalid("Este evento se cobró con más de un pago — todavía no se puede editar desde acá.");
  }
  const payment = activePayments.rows[0] as any;
  if (!CASH_METHODS.has(payment.method)) {
    throw invalid("El pago de este evento no es un medio real de Caja — todavía no se puede editar desde acá.");
  }

  const registered = await db.execute(sql`
    SELECT id, shift_id FROM cash_movements
    WHERE source_type = 'event' AND source_id = ${eventId} AND anulado = false
  `);
  if (registered.rows.length !== 1) {
    throw invalid("El cobro de Caja de este evento no existe o no es unívoco — todavía no se puede editar desde acá.");
  }
  const cashRow = registered.rows[0] as any;
  if (cashRow.shift_id) {
    const shiftRow = await db.execute(sql`SELECT status FROM cash_shifts WHERE id = ${cashRow.shift_id}`);
    if ((shiftRow.rows[0] as any)?.status === "closed") {
      throw Object.assign(new Error("No se puede editar: el turno de Caja de este cobro ya está cerrado."), { statusCode: 403 });
    }
  }

  const folioRow = await db.execute(sql`SELECT id FROM folios WHERE entity_type = 'event' AND entity_id = ${eventId} LIMIT 1`);
  const folio = folioRow.rows[0] as any;
  if (!folio) throw invalid("Este evento no tiene folio registrado.");

  const folioPayments = await db.execute(sql`
    SELECT fm.id, fm.amount
    FROM folio_movements fm
    WHERE fm.folio_id = ${folio.id} AND fm.type = 'payment'
      AND fm.source_type = 'event_payment' AND fm.source_id = ${payment.id}
      AND NOT EXISTS (SELECT 1 FROM folio_movements v WHERE v.voided_movement_id = fm.id AND v.type = 'void')
  `);
  if (folioPayments.rows.length !== 1) {
    throw invalid("El movimiento de pago del folio no existe o no es unívoco — todavía no se puede editar desde acá.");
  }
  const folioPayment = folioPayments.rows[0] as any;

  const amount = Number(payment.amount);
  const label = `${invoice.tipo_comprobante}-${String(invoice.punto_venta).padStart(4, "0")}-${String(invoice.numero).padStart(8, "0")}`;
  const shift = await storage.getOrCreateActiveTurno("events");

  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT id FROM sales_invoices WHERE id = ${invoiceId} AND estado IN ('emitida','parcial') FOR UPDATE`);
    if (locked.rows.length !== 1) throw invalid("El comprobante ya no está disponible para editar");

    const newPayment = await tx.execute(sql`
      INSERT INTO event_payments (id, event_id, amount, method, is_advance, paid_at, created_at, status)
      VALUES (${randomUUID()}, ${eventId}, ${payment.amount}, ${newMethod}, 'false', NOW(), NOW(), 'active')
      RETURNING id
    `);
    const newPaymentId = (newPayment.rows[0] as any).id;
    await tx.execute(sql`
      UPDATE event_payments SET status = 'anulado', motivo_anulacion = 'Edición de forma de pago', anulado_at = NOW()
      WHERE id = ${payment.id}
    `);

    await tx.execute(sql`
      UPDATE cash_movements SET anulado = true, motivo_anulacion = 'Edición de forma de pago', anulado_por = ${operator}, anulado_at = NOW()
      WHERE source_type = 'event' AND source_id = ${eventId} AND anulado = false
    `);
    await tx.execute(sql`INSERT INTO cash_movements
      (id, shift_id, area, source_type, source_id, source_label, payment_method, amount, movement_type, registered_by, receipt_type, receipt_number)
      VALUES (${randomUUID()}, ${shift.id}, 'events', 'event', ${eventId}, ${label}, ${newMethod}, ${amount.toFixed(2)},
        'income', ${operator}, ${invoice.tipo_comprobante}, nextval('cash_movements_receipt_number_seq'::regclass)::text)`);

    await tx.execute(sql`
      INSERT INTO folio_movements (folio_id, type, amount, description, voided_movement_id, void_reason, registered_by)
      VALUES (${folio.id}, 'void', ${(-Number(folioPayment.amount)).toFixed(2)}, 'Edición de forma de pago',
        ${folioPayment.id}, 'Edición de forma de pago', ${operator})
    `);
    await tx.execute(sql`
      INSERT INTO folio_movements (folio_id, type, amount, description, payment_method, source_type, source_id, registered_by)
      VALUES (${folio.id}, 'payment', ${amount.toFixed(2)}, ${`Pago Evento`}, ${newMethod}, 'event_payment', ${newPaymentId}, ${operator})
    `);
    await tx.execute(sql`
      UPDATE folios f SET
        total_charges = COALESCE((SELECT SUM(amount::numeric) FROM folio_movements WHERE folio_id = f.id AND type IN ('charge','transfer_in')), 0),
        total_payments = COALESCE((SELECT SUM(amount::numeric) FROM folio_movements WHERE folio_id = f.id AND type IN ('payment','advance','discount','transfer_out','void')), 0)
      WHERE f.id = ${folio.id}
    `);
    await tx.execute(sql`UPDATE folios SET balance = total_charges::numeric - total_payments::numeric WHERE id = ${folio.id}`);

    const result = await tx.execute(sql`
      UPDATE sales_invoices SET cash_forma_pago = ${newMethod}, cash_forma_pago_detalle = ${JSON.stringify([{ method: newMethod, amount }])}::jsonb
      WHERE id = ${invoiceId}
      RETURNING *
    `);
    return result.rows[0];
  });
}
