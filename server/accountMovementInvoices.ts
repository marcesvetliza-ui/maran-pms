import { sql, type SQL } from "drizzle-orm";
import type { AccountMovementInvoiceDisplay } from "@shared/account-movement-reference";
import { activeSalesRecord } from "./salesArchive";

type Executor = { execute: (query: SQL) => Promise<any> };
type Movement = { id: string };
type Invoice = {
  id: number; type: string; pointOfSale: number; number: number; status: string;
  operationId: string | null; paymentId: string | null; groupPaymentId: string | null;
  entityType: string | null; entityId: string | null; reservationId: string | null;
};
const inValues = (column: SQL, values: string[]) => values.length
  ? sql`${column} IN (${sql.join([...new Set(values)].map(value => sql`${value}`), sql`, `)})`
  : sql`false`;
function invoiceId(value: string | null): string | null {
  if (!value) return null;
  const explicit = /^invoice:(\d+):/.exec(value);
  if (explicit) return explicit[1];
  try {
    const id = JSON.parse(value)?.id;
    return (typeof id === "number" || (typeof id === "string" && /^\d+$/.test(id))) &&
      Number.isSafeInteger(Number(id)) && Number(id) > 0 ? String(Number(id)) : null;
  } catch { return null; }
}
function references(i: Invoice): string[] {
  const number = String(i.number).padStart(8, "0");
  return [
    `${i.type}-${number}`,
    ...[4, 5].flatMap(width => {
      const pv = String(i.pointOfSale).padStart(width, "0");
      return [`${i.type}-${pv}-${number}`, `${i.type} ${pv}-${number}`];
    }),
  ];
}

/** Two bounded batch reads, never a match by amount, name or reservation alone.
 * An ambiguous or unissued document stays unidentified. Stored ledger references
 * remain untouched: corrections and recovery still use their original identity.
 */
export async function enrichAccountMovementInvoices<T extends Movement>(database: Executor, movements: T[]): Promise<Array<T & { invoiceDisplay?: AccountMovementInvoiceDisplay }>> {
  if (!movements.length) return movements;
  const links = (await database.execute(sql`
    SELECT m.id, m.reference, m.entity_type AS "entityType", m.entity_id AS "entityId",
      m.reservation_id AS "reservationId", m.payment_id AS "paymentId", m.group_payment_id AS "groupPaymentId",
      p.invoice_ref AS "paymentReference", gp.invoice_id AS "groupInvoiceId", gp.invoice_ref AS "groupReference"
    FROM account_movements m LEFT JOIN payments p ON p.id=m.payment_id
    LEFT JOIN group_payments gp ON gp.id=m.group_payment_id
    WHERE ${inValues(sql`m.id`, movements.map(m => m.id))}
  `)).rows as any[];
  const ids = links.flatMap(m => [invoiceId(m.reference), invoiceId(m.paymentReference), invoiceId(m.groupReference), m.groupInvoiceId && String(m.groupInvoiceId)]).filter(Boolean) as string[];
  const operations = links.map(m => /^credit-operation:(.+)$/.exec(m.reference || "")?.[1]).filter(Boolean) as string[];
  const payments = links.map(m => m.paymentId).filter(Boolean) as string[];
  const groups = links.map(m => m.groupPaymentId).filter(Boolean) as string[];
  const refs = links.map(m => m.reference).filter((ref): ref is string => /^(?:F|NC|ND)[A-Z]?[ -]\d/.test(ref || ""));
  if (![ids, operations, payments, groups, refs].some(values => values.length)) return movements;
  const invoices = (await database.execute(sql`
    SELECT si.id, si.tipo_comprobante AS type, si.punto_venta AS "pointOfSale", si.numero AS number,
      si.estado AS status, si.payment_id AS "paymentId", si.group_payment_id AS "groupPaymentId",
      si.credit_reapplication_intent->>'operationId' AS "operationId",
      si.recipient_entity_type AS "entityType", si.recipient_entity_id AS "entityId", si.reserva_id AS "reservationId"
    FROM sales_invoices si
    WHERE si.estado IN ('emitida','parcial','anulada') AND si.numero>0 AND si.punto_venta>0
      AND ${activeSalesRecord("invoice", sql`si.id`)} AND (
        ${inValues(sql`si.id::text`, ids)} OR
        ${inValues(sql`si.credit_reapplication_intent->>'operationId'`, operations)} OR
        ${inValues(sql`si.payment_id`, payments)} OR ${inValues(sql`si.group_payment_id`, groups)} OR
        ${inValues(sql`si.tipo_comprobante || '-' || lpad(si.numero::text,8,'0')`, refs)} OR
        ${sql.join([4, 5].flatMap(width => ["-", " "].map(separator => inValues(
          sql`si.tipo_comprobante || ${separator} || lpad(si.punto_venta::text,${width},'0') || '-' || lpad(si.numero::text,8,'0')`, refs))), sql` OR `)}
      )
  `)).rows as Invoice[];
  const byMovement = new Map<string, AccountMovementInvoiceDisplay>();
  for (const m of links) {
    const explicitIds = [invoiceId(m.reference), invoiceId(m.paymentReference), invoiceId(m.groupReference), m.groupInvoiceId && String(m.groupInvoiceId)];
    const candidates = invoices.filter(i =>
      explicitIds.includes(String(i.id)) ||
      (i.operationId && m.reference === `credit-operation:${i.operationId}`) ||
      (i.paymentId && i.paymentId === m.paymentId) ||
      (i.groupPaymentId && i.groupPaymentId === m.groupPaymentId) ||
      (references(i).includes(m.reference) &&
        (!i.entityType || (i.entityType === m.entityType && i.entityId === m.entityId)) &&
        (!i.reservationId || !m.reservationId || i.reservationId === m.reservationId))
    );
    if (candidates.length !== 1) continue;
    const { id, type, pointOfSale, number, status } = candidates[0];
    byMovement.set(m.id, { id, type, pointOfSale, number, status });
  }
  return movements.map(movement => {
    const invoiceDisplay = byMovement.get(movement.id);
    return invoiceDisplay ? { ...movement, invoiceDisplay } : movement;
  });
}
