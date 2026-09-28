import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../db-storage";

const CASH_METHODS = new Set(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "mercadopago"]);
const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Corrige la forma de pago de un pedido de Restaurante ya cerrado y
 * facturado (server/routes/restaurant.ts, cierre de pedido): anula y rehace
 * tanto el cash_movement (source_type='restaurant_order', source_id=orderId)
 * como el movimiento de pago del folio del pedido (entity_type=
 * 'restaurant_order', payment sourceType='restaurant_payment') — el mismo
 * contraasiento de monto negativo + voidedMovementId que ya usa
 * voidReservationPaymentAtomic (server/db-storage.ts), no el patrón de monto
 * positivo del "void" de NC en server/billing/routes.ts (ese bucket suma en
 * vez de cancelar — confirmado con las pruebas existentes de folio, no algo
 * a repetir acá).
 *
 * Alcance acotado, como en editReservationInvoiceCashMethod: solo pedidos
 * cerrados con UN único medio real de Caja (nada de pago dividido, Cuenta
 * Corriente ni Cuenta de Habitación) — pedidos con múltiples formas de cobro
 * quedan para una vuelta aparte.
 */
export async function editRestaurantInvoiceCashMethod(invoiceId: number, newMethod: string, operator: string): Promise<any> {
  const existing = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${invoiceId} LIMIT 1`);
  const invoice = existing.rows[0] as any;
  if (!invoice) throw Object.assign(new Error("Comprobante no encontrado"), { statusCode: 404 });
  if (!invoice.restaurant_order_id) throw invalid("Este comprobante no está vinculado a un pedido de Restaurante.");
  if (invoice.estado !== "emitida" && invoice.estado !== "parcial") throw invalid("Solo se puede editar la forma de pago de un comprobante emitido.");
  if (!CASH_METHODS.has(newMethod)) {
    throw invalid("Por ahora solo se puede cambiar entre formas de pago reales (no Cuenta Corriente ni Cuenta de Habitación) en pedidos de Restaurante.");
  }

  const orderId = String(invoice.restaurant_order_id);

  const registered = await db.execute(sql`
    SELECT id, shift_id FROM cash_movements
    WHERE source_type = 'restaurant_order' AND source_id = ${orderId} AND anulado = false
  `);
  if (registered.rows.length === 0) {
    throw invalid("Este pedido no tiene un cobro real de Caja para editar.");
  }
  if (registered.rows.length > 1) {
    throw invalid("Este pedido se cobró con más de una forma de pago — todavía no se puede editar desde acá.");
  }
  for (const row of registered.rows as any[]) {
    if (!row.shift_id) continue;
    const shiftRow = await db.execute(sql`SELECT status FROM cash_shifts WHERE id = ${row.shift_id}`);
    if ((shiftRow.rows[0] as any)?.status === "closed") {
      throw Object.assign(new Error("No se puede editar: el turno de Caja de este cobro ya está cerrado."), { statusCode: 403 });
    }
  }

  const folioRow = await db.execute(sql`SELECT id FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = ${orderId} LIMIT 1`);
  const folio = folioRow.rows[0] as any;
  if (!folio) throw invalid("Este pedido no tiene folio registrado.");

  const folioPayments = await db.execute(sql`
    SELECT fm.id, fm.amount
    FROM folio_movements fm
    WHERE fm.folio_id = ${folio.id} AND fm.type = 'payment'
      AND fm.source_type = 'restaurant_payment' AND fm.source_id = ${orderId}
      AND NOT EXISTS (SELECT 1 FROM folio_movements v WHERE v.voided_movement_id = fm.id AND v.type = 'void')
  `);
  if (folioPayments.rows.length !== 1) {
    throw invalid("El movimiento de pago del folio no existe o no es unívoco — todavía no se puede editar desde acá.");
  }
  const folioPayment = folioPayments.rows[0] as any;

  const total = Number(invoice.monto_total);
  const label = `${invoice.tipo_comprobante}-${String(invoice.punto_venta).padStart(4, "0")}-${String(invoice.numero).padStart(8, "0")}`;
  const shift = await storage.getOrCreateActiveTurno("restaurant");

  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT id FROM sales_invoices WHERE id = ${invoiceId} AND estado IN ('emitida','parcial') FOR UPDATE`);
    if (locked.rows.length !== 1) throw invalid("El comprobante ya no está disponible para editar");

    await tx.execute(sql`
      UPDATE cash_movements SET anulado = true, motivo_anulacion = 'Edición de forma de pago', anulado_por = ${operator}, anulado_at = NOW()
      WHERE source_type = 'restaurant_order' AND source_id = ${orderId} AND anulado = false
    `);
    await tx.execute(sql`INSERT INTO cash_movements
      (id, shift_id, area, source_type, source_id, source_label, payment_method, amount, movement_type, registered_by, receipt_type, receipt_number)
      VALUES (${randomUUID()}, ${shift.id}, 'restaurant', 'restaurant_order', ${orderId}, ${label}, ${newMethod}, ${total.toFixed(2)},
        'income', ${operator}, ${invoice.tipo_comprobante}, nextval('cash_movements_receipt_number_seq'::regclass)::text)`);

    await tx.execute(sql`
      INSERT INTO folio_movements (folio_id, type, amount, description, voided_movement_id, void_reason, registered_by)
      VALUES (${folio.id}, 'void', ${(-Number(folioPayment.amount)).toFixed(2)}, 'Edición de forma de pago',
        ${folioPayment.id}, 'Edición de forma de pago', ${operator})
    `);
    await tx.execute(sql`
      INSERT INTO folio_movements (folio_id, type, amount, description, payment_method, source_type, source_id, registered_by)
      VALUES (${folio.id}, 'payment', ${total.toFixed(2)}, ${`Cobro — ${newMethod}`}, ${newMethod}, 'restaurant_payment', ${orderId}, ${operator})
    `);
    await tx.execute(sql`
      UPDATE folios f SET
        total_charges = COALESCE((SELECT SUM(amount::numeric) FROM folio_movements WHERE folio_id = f.id AND type IN ('charge','transfer_in')), 0),
        total_payments = COALESCE((SELECT SUM(amount::numeric) FROM folio_movements WHERE folio_id = f.id AND type IN ('payment','advance','discount','transfer_out','void')), 0)
      WHERE f.id = ${folio.id}
    `);
    await tx.execute(sql`UPDATE folios SET balance = total_charges::numeric - total_payments::numeric WHERE id = ${folio.id}`);

    await tx.execute(sql`UPDATE restaurant_orders SET payment_method = ${newMethod} WHERE id = ${orderId}`);

    const result = await tx.execute(sql`
      UPDATE sales_invoices SET cash_forma_pago = ${newMethod}, cash_forma_pago_detalle = ${JSON.stringify([{ method: newMethod, amount: total }])}::jsonb
      WHERE id = ${invoiceId}
      RETURNING *
    `);
    return result.rows[0];
  });
}
