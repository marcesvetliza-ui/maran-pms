import { sql } from "drizzle-orm";
import type { db } from "../db";
import { isPostCheckoutCharge } from "@shared/postCheckout";
import { unitParent } from "@shared/chargeUnits";

type Executor = Pick<typeof db, "execute">;
const fail = (message: string) => Object.assign(new Error(message), { statusCode: 409 });
/** Called within the payment transaction: an issued invoice owns the allowance,
 * and its row lock serializes split payments and independent browser retries. */
export async function lockPostCheckoutInvoicePayment(tx: Executor, reservationId: string, invoiceId: number, amount: string) {
  const invoice = (await tx.execute(sql`SELECT * FROM sales_invoices WHERE id=${invoiceId} AND reserva_id=${reservationId} FOR UPDATE`)).rows[0] as any;
  const sourceIds = invoice?.source_charge_ids;
  if (!invoice || invoice.estado !== "emitida" || Number(invoice.monto_acreditado || 0) !== 0 ||
      !Array.isArray(sourceIds) || !sourceIds.length || !sourceIds.every(isPostCheckoutCharge)) {
    throw fail("El cobro de una estadía cerrada debe corresponder a una factura de consumos posteriores vigente.");
  }
  const parents = [...new Set(sourceIds.map((source: string) => unitParent(source) || source))];
  const sources = (await tx.execute(sql`SELECT id FROM charges WHERE reservation_id=${reservationId} AND status='active' AND id IN (${sql.join(parents.map(id => sql`${id}`), sql`, `)})`)).rows;
  if (sources.length !== parents.length) throw fail("Los consumos de la factura requieren revisión.");
  if ((await tx.execute(sql`SELECT id FROM sales_invoices WHERE nota_credito_id=${invoiceId} LIMIT 1`)).rows.length) {
    throw fail("La factura tiene una corrección fiscal. Revisala antes de cobrar.");
  }
  const linked = (await tx.execute(sql`SELECT amount, invoice_ref FROM payments WHERE reservation_id=${reservationId}
    AND status IS DISTINCT FROM 'anulado' AND invoice_ref IS NOT NULL`)).rows as any[];
  let paidCents = 0;
  for (const payment of linked) {
    let ref: any;
    try { ref = typeof payment.invoice_ref === "string" ? JSON.parse(payment.invoice_ref) : payment.invoice_ref; }
    catch { throw fail("Un cobro histórico conserva un vínculo fiscal que requiere revisión."); }
    if (Number(ref?.id) === invoiceId) paidCents += Math.round(Number(payment.amount) * 100);
    else for (const application of ref?.reapplications || []) {
      if (Number(application.invoiceId) === invoiceId) paidCents += Math.round(Number(application.amount) * 100);
    }
  }
  if (paidCents + Math.round(Number(amount) * 100) > Math.round(Number(invoice.monto_total) * 100)) {
    throw fail("El cobro supera el saldo pendiente de la factura. Actualizá la cuenta antes de continuar.");
  }
}
