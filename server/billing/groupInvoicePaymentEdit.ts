import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../db-storage";

const CASH_METHODS = new Set(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "mercadopago"]);
const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Corrige la forma de pago de una factura de Grupo (server/routes/groups.ts,
 * storage.recordGroupPayment — la "fusión atómica factura+cobro"). A
 * diferencia de los otros circuitos, acá NO hay folio: Grupos usa
 * group_payments (recibo padre) + payments (una fila por reserva asignada,
 * reusa la tabla de pagos de Reservas) + cash_movements (una fila por
 * método, source_type='group_payment', source_id=groupId, area='reception',
 * payment_id=group_payments.id). sales_invoices.group_payment_id es un FK
 * único e inmutable al group_payments que "reclamó" la factura — siempre
 * exactamente UNO, pero ese pago puede repartirse en N filas de payments
 * (una por reserva) que hay que anular y rehacer todas juntas, no solo una.
 *
 * Alcance acotado a propósito, igual que los demás circuitos: solo pagos
 * con un único método real de Caja — nada de "varios" (paymentMethodDetail
 * con más de una fila), Cuenta Corriente, ni con retención (retention por
 * fila o retentionDetail a nivel del pago — ahí payments.amount ya no
 * coincide 1:1 con cash_movements.amount, rompe el supuesto de este editor).
 */
export async function editGroupInvoiceCashMethod(invoiceId: number, newMethod: string, operator: string): Promise<any> {
  const existing = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${invoiceId} LIMIT 1`);
  const invoice = existing.rows[0] as any;
  if (!invoice) throw Object.assign(new Error("Comprobante no encontrado"), { statusCode: 404 });
  if (!invoice.group_payment_id) throw invalid("Este comprobante no está vinculado a un pago de Grupo.");
  if (invoice.estado !== "emitida" && invoice.estado !== "parcial") throw invalid("Solo se puede editar la forma de pago de un comprobante emitido.");
  if (!CASH_METHODS.has(newMethod)) {
    throw invalid("Por ahora solo se puede cambiar entre formas de pago reales (no Cuenta Corriente) en facturas de Grupo.");
  }

  const groupPaymentRow = await db.execute(sql`SELECT * FROM group_payments WHERE id = ${invoice.group_payment_id} LIMIT 1`);
  const groupPayment = groupPaymentRow.rows[0] as any;
  if (!groupPayment) throw invalid("El pago de Grupo vinculado no existe.");
  const detail = Array.isArray(groupPayment.payment_method_detail) ? groupPayment.payment_method_detail : null;
  if (!detail || detail.length !== 1) {
    throw invalid("Este pago se cobró con más de una forma de pago — todavía no se puede editar desde acá.");
  }
  const detailRow = detail[0] as { method: string; amount: number | string; reference?: string };
  if ((detailRow as any).retention) {
    throw invalid("Este pago tiene una retención asociada — todavía no se puede editar desde acá.");
  }
  const retentionDetail = groupPayment.retention_detail;
  if (Array.isArray(retentionDetail) ? retentionDetail.length > 0 : !!retentionDetail) {
    throw invalid("Este pago tiene una retención asociada — todavía no se puede editar desde acá.");
  }
  if (!CASH_METHODS.has(detailRow.method)) {
    throw invalid("Este pago no se cobró con un medio real de Caja — todavía no se puede editar desde acá.");
  }

  const cashRows = await db.execute(sql`
    SELECT id, shift_id, amount FROM cash_movements
    WHERE source_type = 'group_payment' AND source_id = ${String(invoice.group_id)} AND payment_id = ${groupPayment.id} AND anulado = false
  `);
  if (cashRows.rows.length !== 1) {
    throw invalid("El cobro de Caja de este pago no existe o no es unívoco — todavía no se puede editar desde acá.");
  }
  const cashRow = cashRows.rows[0] as any;
  if (cashRow.shift_id) {
    const shiftRow = await db.execute(sql`SELECT status FROM cash_shifts WHERE id = ${cashRow.shift_id}`);
    if ((shiftRow.rows[0] as any)?.status === "closed") {
      throw Object.assign(new Error("No se puede editar: el turno de Caja de este cobro ya está cerrado."), { statusCode: 403 });
    }
  }

  const paymentRows = await db.execute(sql`
    SELECT * FROM payments WHERE group_payment_id = ${groupPayment.id} AND status = 'active'
  `);

  const label = `${invoice.tipo_comprobante}-${String(invoice.punto_venta).padStart(4, "0")}-${String(invoice.numero).padStart(8, "0")}`;
  const shift = await storage.getOrCreateActiveTurno("reception");

  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`SELECT id FROM sales_invoices WHERE id = ${invoiceId} AND estado IN ('emitida','parcial') FOR UPDATE`);
    if (locked.rows.length !== 1) throw invalid("El comprobante ya no está disponible para editar");

    for (const row of paymentRows.rows as any[]) {
      await tx.execute(sql`
        UPDATE payments SET status = 'anulado', motivo_anulacion = 'Edición de forma de pago', anulado_por = ${operator}, anulado_at = NOW()
        WHERE id = ${row.id}
      `);
      await tx.execute(sql`
        INSERT INTO payments
          (id, reservation_id, amount, method, date, reference, received_by, notes, billing_target, company_id, agency_id, status, group_payment_id)
        VALUES
          (${randomUUID()}, ${row.reservation_id}, ${row.amount}, ${newMethod}, ${row.date}, ${row.reference}, ${row.received_by}, ${row.notes},
           ${row.billing_target}, ${row.company_id}, ${row.agency_id}, 'active', ${groupPayment.id})
      `);
    }

    await tx.execute(sql`
      UPDATE cash_movements SET anulado = true, motivo_anulacion = 'Edición de forma de pago', anulado_por = ${operator}, anulado_at = NOW()
      WHERE id = ${cashRow.id}
    `);
    await tx.execute(sql`INSERT INTO cash_movements
      (id, shift_id, area, source_type, source_id, source_label, payment_method, amount, movement_type, registered_by, receipt_type, receipt_number, payment_id)
      VALUES (${randomUUID()}, ${shift.id}, 'reception', 'group_payment', ${String(invoice.group_id)}, ${label}, ${newMethod}, ${cashRow.amount},
        'income', ${operator}, ${invoice.tipo_comprobante}, nextval('cash_movements_receipt_number_seq'::regclass)::text, ${groupPayment.id})`);

    await tx.execute(sql`
      UPDATE group_payments SET method = ${newMethod}, payment_method_detail = ${JSON.stringify([{ method: newMethod, amount: Number(detailRow.amount), reference: detailRow.reference || null }])}::jsonb
      WHERE id = ${groupPayment.id}
    `);

    const total = Number(invoice.monto_total);
    const result = await tx.execute(sql`
      UPDATE sales_invoices SET cash_forma_pago = ${newMethod}, cash_forma_pago_detalle = ${JSON.stringify([{ method: newMethod, amount: total }])}::jsonb
      WHERE id = ${invoiceId}
      RETURNING *
    `);
    return result.rows[0];
  });
}
