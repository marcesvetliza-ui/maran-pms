import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../db-storage";

const CASH_METHODS = new Set(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "mercadopago"]);
const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Corrige la forma de pago de una factura de Recepción (vinculada a una
 * reserva) que se cobró con un único medio real de Caja — el circuito
 * "cashArea && cashFormaPago" de POST /api/billing/invoices
 * (server/billing/routes.ts), que solo crea cash_movements
 * (source_type='comprobante', source_id=invoiceId) sin tocar payments ni el
 * folio de la reserva. Mismo criterio que editCenterSaleInvoicePaymentMethod
 * (centerSaleSettlement.ts): nunca reescribe el movimiento viejo, siempre lo
 * anula y crea uno nuevo.
 *
 * Alcance de esta primera etapa — confirmado después de investigar cómo se
 * cobra una factura de reserva: NO cubre facturas cobradas a Cuenta
 * Corriente (createReservationPaymentWithLedger también crea un
 * folio_movements y recalcula el saldo del folio — revertir eso de forma
 * segura sin un caso concreto para probarlo es un riesgo real, queda para
 * una vuelta aparte) ni permite pasar A Cuenta Corriente (no hay una ficha
 * asociada de forma confiable en este circuito). Solo cubre cambiar entre
 * medios reales de Caja (efectivo, tarjeta, transferencia, mercadopago).
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
    throw invalid("Este comprobante no tiene un cobro real de Caja para editar — puede estar a Cuenta Corriente o saldado con crédito, todavía no se puede editar desde acá.");
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
