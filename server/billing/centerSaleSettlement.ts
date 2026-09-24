import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage, getArgentinaToday } from "../db-storage";

const CASH_METHODS = new Set(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "mercadopago"]);
const RETENTION_METHODS = new Set(["retencion_iibb", "retencion_ganancias"]);
const AREAS = new Set(["recepcion", "restaurant", "spa", "events"]);
const ACCOUNT_AREAS: Record<string, string> = { recepcion: "recepcion", restaurant: "restaurant", spa: "spa", events: "eventos" };

type Detail = { method: string; amount: number };
const cents = (value: number) => Math.round(value * 100);
const money = (value: number) => (value / 100).toFixed(2);
const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

export function validateCenterSalePaymentDetail(detail: unknown, total: number, area: unknown, recipient: unknown): Detail[] {
  if (!AREAS.has(String(area))) throw invalid("El área de cobro no es válida");
  if (!Array.isArray(detail) || detail.length === 0) throw invalid("Indicá cómo se cubre el total del comprobante");
  const seen = new Set<string>();
  const result: Detail[] = [];
  let covered = 0;
  for (const entry of detail) {
    const method = entry?.method;
    const amount = entry?.amount;
    if (typeof method !== "string" || !(CASH_METHODS.has(method) || RETENTION_METHODS.has(method) || method === "cuenta_corriente") || seen.has(method)) {
      throw invalid("Las formas de cobro deben ser válidas y no repetirse");
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || cents(amount) <= 0 || Math.abs(cents(amount) - amount * 100) > 0.000001) {
      throw invalid("Cada forma de cobro necesita un importe positivo con dos decimales como máximo");
    }
    if (method === "cuenta_corriente" && !(
      recipient && typeof recipient === "object" &&
      ["guest", "company", "agency"].includes(String((recipient as any).type)) &&
      typeof (recipient as any).id === "string" && (recipient as any).id.trim()
    )) throw invalid("Cuenta Corriente requiere una ficha de huésped, empresa o agencia");
    seen.add(method);
    covered += cents(amount);
    result.push({ method, amount: Number(money(cents(amount))) });
  }
  if (covered !== cents(total)) throw invalid("La suma de las formas de cobro debe coincidir con el total del comprobante");
  return result;
}

/** Un solo commit para Caja y Cuenta Corriente, después de la autorización fiscal. */
export async function settleCenterSaleInvoice(invoiceId: number, operator?: string, beforeAccountInsert?: () => Promise<void>): Promise<void> {
  const existing = await db.execute(sql`SELECT * FROM sales_invoices WHERE id = ${invoiceId} LIMIT 1`);
  const invoice = existing.rows[0] as any;
  if (!invoice || !invoice.center_settlement_area || invoice.estado !== "emitida") throw invalid("La factura no está disponible para completar el cobro");
  const detail = validateCenterSalePaymentDetail(invoice.cash_forma_pago_detalle, Number(invoice.monto_total),
    invoice.center_settlement_area,
    invoice.recipient_entity_type && invoice.recipient_entity_id
      ? { type: invoice.recipient_entity_type, id: invoice.recipient_entity_id } : null);
  const area = String(invoice.center_settlement_area);
  const cashRows = detail.filter(row => row.method !== "cuenta_corriente");
  const shift = cashRows.length ? await storage.getOrCreateActiveTurno(area) : null;
  const label = `${invoice.tipo_comprobante}-${String(invoice.punto_venta).padStart(4, "0")}-${String(invoice.numero).padStart(8, "0")}`;

  await db.transaction(async tx => {
    const locked = await tx.execute(sql`SELECT id FROM sales_invoices WHERE id = ${invoiceId} AND estado = 'emitida' FOR UPDATE`);
    if (locked.rows.length !== 1) throw invalid("La factura ya no está disponible para completar el cobro");
    const registered = await tx.execute(sql`SELECT payment_method, amount FROM cash_movements WHERE source_type = 'comprobante' AND source_id = ${String(invoiceId)} AND anulado = false`);
    const account = await tx.execute(sql`SELECT entity_type, entity_id, amount FROM account_movements
      WHERE reference = ${label} AND type = 'cargo' AND voided = false AND entity_type = ${invoice.recipient_entity_type || ""} AND entity_id = ${invoice.recipient_entity_id || ""}`);
    const cc = detail.find(row => row.method === "cuenta_corriente");
    if (registered.rows.length || account.rows.length) {
      const matchingCash = registered.rows.length === cashRows.length && cashRows.every(row =>
        registered.rows.some((record: any) => record.payment_method === row.method && cents(Number(record.amount)) === cents(row.amount)));
      const matchingAccount = cc ? account.rows.length === 1 && cents(Number((account.rows[0] as any).amount)) === cents(cc.amount) : account.rows.length === 0;
      if (matchingCash && matchingAccount) {
        await tx.execute(sql`UPDATE sales_invoices SET center_settlement_status = 'settled' WHERE id = ${invoiceId}`);
        return;
      }
      throw Object.assign(new Error("El cobro de esta factura tiene movimientos incompletos o distintos; requiere revisión manual"), { statusCode: 409 });
    }

    for (const row of cashRows) {
      await tx.execute(sql`INSERT INTO cash_movements
        (id, shift_id, area, source_type, source_id, source_label, payment_method, amount, movement_type, registered_by, receipt_type, receipt_number)
        VALUES (${randomUUID()}, ${shift!.id}, ${area}, 'comprobante', ${String(invoiceId)}, ${label}, ${row.method}, ${money(cents(row.amount))},
          ${RETENTION_METHODS.has(row.method) ? "informational" : "income"}, ${operator || null}, ${invoice.tipo_comprobante}, nextval('cash_movements_receipt_number_seq'::regclass)::text)`);
    }
    if (cc) {
      await beforeAccountInsert?.();
      await tx.execute(sql`INSERT INTO account_movements
        (id, entity_type, entity_id, date, type, description, amount, reference, payment_method, area, created_by)
        VALUES (${randomUUID()}, ${invoice.recipient_entity_type}, ${invoice.recipient_entity_id}, ${getArgentinaToday()},
          'cargo', ${`${label} — ${invoice.cliente_razon_social}`}, ${money(cents(cc.amount))}, ${label}, 'cuenta_corriente', ${ACCOUNT_AREAS[area]}, ${operator || null})`);
    }
    await tx.execute(sql`UPDATE sales_invoices SET center_settlement_status = 'settled' WHERE id = ${invoiceId}`);
  });
}
