import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../db-storage";
import { editLinkedReservationInvoicePayment } from "./linkedReservationInvoicePaymentEdit";

const CASH_METHODS = new Set(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "mercadopago"]);
const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/** Correct a reservation invoice paid with one real tender.
 * Legacy invoice-owned cash receipts retain their existing reversal flow.
 * Reservation-owned receipts use their explicit payment/folio identity in
 * editLinkedReservationInvoicePayment, preserving the unique receipt and
 * auditing its classification change. Neither flow converts CC to money.
 */
export async function editReservationInvoiceCashMethod(invoiceId: number, newMethod: string, operator: string): Promise<any> {
  const existing = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${invoiceId} LIMIT 1`);
  const invoice = existing.rows[0] as any;
  if (!invoice) throw Object.assign(new Error("Comprobante no encontrado"), { statusCode: 404 });
  if (!invoice.reserva_id) throw invalid("Este comprobante no está vinculado a una reserva.");
  if (invoice.center_settlement_area) throw invalid("Este comprobante se cobró desde el Centro de Comprobantes — editalo desde ahí.");
  if (invoice.estado !== "emitida" && invoice.estado !== "parcial") throw invalid("Solo se puede editar la forma de pago de un comprobante emitido.");
  if (!CASH_METHODS.has(newMethod)) {
    throw invalid("Por ahora solo se puede cambiar entre formas de pago reales (no Cuenta Corriente) en comprobantes de reserva.");
  }

  const registered = await db.execute(sql`
    SELECT id, shift_id, area FROM cash_movements
    WHERE source_type = 'comprobante' AND source_id = ${String(invoiceId)} AND anulado = false
  `);
  if (registered.rows.length === 0) {
    return editLinkedReservationInvoicePayment(invoiceId, newMethod, operator);
  }
  for (const row of registered.rows as any[]) {
    if (!row.shift_id) continue;
    const shiftRow = await db.execute(sql`SELECT status FROM cash_shifts WHERE id = ${row.shift_id}`);
    if ((shiftRow.rows[0] as any)?.status === "closed") {
      throw Object.assign(new Error("No se puede editar: el turno de Caja de este cobro ya está cerrado."), { statusCode: 403 });
    }
  }

  const area = String((registered.rows[0] as any).area || "recepcion");
  const total = Number(invoice.monto_total);
  const label = `${invoice.tipo_comprobante}-${String(invoice.punto_venta).padStart(4, "0")}-${String(invoice.numero).padStart(8, "0")}`;
  const shift = await storage.getOrCreateActiveTurno(area);

  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT id FROM sales_invoices WHERE id = ${invoiceId} AND estado IN ('emitida','parcial') FOR UPDATE`);
    if (locked.rows.length !== 1) throw invalid("El comprobante ya no está disponible para editar");

    await tx.execute(sql`
      UPDATE cash_movements SET anulado = true, motivo_anulacion = 'Edición de forma de pago', anulado_por = ${operator}, anulado_at = NOW()
      WHERE source_type = 'comprobante' AND source_id = ${String(invoiceId)} AND anulado = false
    `);

    await tx.execute(sql`INSERT INTO cash_movements
      (id, shift_id, area, source_type, source_id, source_label, payment_method, amount, movement_type, registered_by, receipt_type, receipt_number)
      VALUES (${randomUUID()}, ${shift.id}, ${area}, 'comprobante', ${String(invoiceId)}, ${label}, ${newMethod}, ${total.toFixed(2)},
        'income', ${operator}, ${invoice.tipo_comprobante}, nextval('cash_movements_receipt_number_seq'::regclass)::text)`);

    const result = await tx.execute(sql`
      UPDATE sales_invoices SET cash_forma_pago = ${newMethod}, cash_forma_pago_detalle = ${JSON.stringify([{ method: newMethod, amount: total }])}::jsonb
      WHERE id = ${invoiceId}
      RETURNING *
    `);
    return result.rows[0];
  });
}
