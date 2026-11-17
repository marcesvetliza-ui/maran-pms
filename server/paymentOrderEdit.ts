import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { PAYMENT_ORDER_METHODS } from "@shared/payment-order-edit";
import { validCalendarDate } from "./stayEligibility";

type Executor = { execute: (query: SQL) => Promise<any> };
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
export const paymentOrderEditInput = z.object({
  fecha: z.string().refine(value => validCalendarDate(value) && Number(value.slice(0, 4)) > 0, "Fecha inválida"),
  formaPago: z.string().trim().min(1).max(80),
  observaciones: z.string().max(5000),
  motivo: z.string().trim().min(3).max(500),
  expectedVersion: z.string().min(1).max(100),
}).strict();

export async function readPaymentOrderEdit(tx: Executor, id: number) {
  const row = (await tx.execute(sql`
    SELECT po.*, po.xmin::text AS edit_version, s.razon_social AS supplier_nombre,
      EXISTS(SELECT 1 FROM payment_order_items i JOIN purchase_invoices p ON p.id=i.invoice_id
        WHERE i.payment_order_id=po.id AND p.tipo_comprobante='REMITO-NF') AS non_fiscal
    FROM payment_orders po JOIN accounting_suppliers s ON s.id=po.supplier_id WHERE po.id=${id}
  `)).rows[0];
  if (!row) throw fail("Orden de pago no encontrada", 404);
  return row;
}

/** Correct an existing OP without settling invoices again or issuing money. */
export async function editPaymentOrder(tx: Executor, id: number, input: z.infer<typeof paymentOrderEditInput>, actor: { id?: string; name?: string }) {
  const before = (await tx.execute(sql`SELECT *, xmin::text AS edit_version FROM payment_orders WHERE id=${id} FOR UPDATE`)).rows[0];
  if (!before) throw fail("Orden de pago no encontrada", 404);
  if (before.edit_version !== input.expectedVersion) throw fail("La OP cambió desde que abriste la edición. Cerrá y volvé a abrirla para ver los datos actuales.");
  const methodChanged = before.forma_pago !== input.formaPago;
  const dateChanged = before.fecha !== input.fecha;
  if (methodChanged && !PAYMENT_ORDER_METHODS.some(method => method.value === input.formaPago)) throw fail("Forma de pago inválida", 400);
  const documents = (await tx.execute(sql`SELECT p.tipo_comprobante FROM payment_order_items i JOIN purchase_invoices p ON p.id=i.invoice_id WHERE i.payment_order_id=${id}`)).rows;
  if (documents.some((p: any) => p.tipo_comprobante === "REMITO-NF") && input.formaPago !== "efectivo") throw fail("Las compras no fiscales se pagan únicamente en efectivo.", 400);
  const previous = { fecha: before.fecha, formaPago: before.forma_pago, observaciones: before.observaciones || "" };
  const next = { fecha: input.fecha, formaPago: input.formaPago, observaciones: input.observaciones };
  if (JSON.stringify(previous) === JSON.stringify(next)) return readPaymentOrderEdit(tx, id);

  // Reclassify the existing payment credits, preserving every amount and entry
  // identity. Date/notes alone never rebuild an entry or alter a mixed payment.
  if ((dateChanged || methodChanged) && before.asiento_id) {
    const entry = (await tx.execute(sql`SELECT * FROM accounting_entries WHERE id=${before.asiento_id} FOR UPDATE`)).rows[0];
    if (!entry || entry.origen_tipo !== "payment_order" || Number(entry.origen_id) !== id) throw fail("El asiento vinculado a esta OP necesita revisión antes de corregir su fecha o forma de pago.");
    if (methodChanged && Number(before.total_abonado) > 0) {
      const accountCode = input.formaPago === "efectivo" ? "1.1.1.01" : "1.1.1.02";
      const account = (await tx.execute(sql`SELECT id FROM accounting_accounts WHERE codigo=${accountCode}`)).rows[0];
      if (!account) throw fail("Falta configurar la cuenta contable del medio de pago elegido.");
      const lines = (await tx.execute(sql`SELECT l.id,l.haber FROM accounting_entry_lines l JOIN accounting_accounts a ON a.id=l.account_id
        WHERE l.entry_id=${before.asiento_id} AND a.codigo IN ('1.1.1.01','1.1.1.02') AND l.debe=0 AND l.haber>0 FOR UPDATE OF l`)).rows;
      const cents = lines.reduce((sum: number, line: any) => sum + Math.round(Number(line.haber) * 100), 0);
      if (cents !== Math.round(Number(before.total_abonado) * 100)) throw fail("Los medios de pago del asiento necesitan conciliación antes de cambiar la forma de pago.");
      for (const line of lines) await tx.execute(sql`UPDATE accounting_entry_lines SET account_id=${account.id} WHERE id=${line.id}`);
    }
    if (dateChanged) {
      const periodo = `${input.fecha.slice(5, 7)}/${input.fecha.slice(0, 4)}`;
      let minuta = entry.numero_minuta;
      if (entry.periodo !== periodo) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'accounting-period:' + periodo}))`);
        minuta = (await tx.execute(sql`SELECT COALESCE(MAX(numero_minuta),0)+1 AS next FROM accounting_entries WHERE periodo=${periodo}`)).rows[0].next;
      }
      await tx.execute(sql`UPDATE accounting_entries SET fecha=${input.fecha},periodo=${periodo},numero_minuta=${minuta} WHERE id=${entry.id}`);
    }
  }
  if (dateChanged && Number(before.retencion_iibb) > 0) {
    // OP retentions have no invoice_id; invoice retentions must stay untouched.
    const number = Number(String(before.numero).split("-").at(-1));
    if (Number.isSafeInteger(number)) await tx.execute(sql`UPDATE iibb_retentions SET fecha_retencion=${input.fecha},fecha_comprobante=${input.fecha}
      WHERE invoice_id IS NULL AND supplier_id=${before.supplier_id} AND nro_comprobante=${number}
      AND fecha_retencion=${before.fecha} AND fecha_comprobante=${before.fecha} AND importe_retenido=${before.retencion_iibb}`);
  }
  await tx.execute(sql`UPDATE payment_orders SET fecha=${input.fecha},forma_pago=${input.formaPago},observaciones=${input.observaciones || null},
    efectivo=CASE WHEN ${methodChanged} THEN ${input.formaPago === "efectivo" ? before.total_abonado : "0"} ELSE efectivo END,
    dep_bancario=CASE WHEN ${methodChanged} THEN ${input.formaPago === "dep_bancario" ? before.total_abonado : "0"} ELSE dep_bancario END,
    cheques=CASE WHEN ${methodChanged} THEN ${input.formaPago === "cheque" ? before.total_abonado : "0"} ELSE cheques END WHERE id=${id}`);
  await tx.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
    VALUES(${actor.id || null},${actor.name || "Sistema"},'update','purchase_invoices','payment_order_edit',${String(id)},
      ${'Corrección de OP ' + before.numero},${JSON.stringify({ reason: input.motivo, before: previous, after: next })},now())`);
  return readPaymentOrderEdit(tx, id);
}
