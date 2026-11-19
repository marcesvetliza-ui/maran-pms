import { sql } from "drizzle-orm";
import { hash } from "./funding/contracts";
import {
  getAvailableReservationAdvancePayments,
  parseReservationInvoiceRef,
} from "@shared/reservationFolio";
import { classifyReservationPaymentMethod } from "../payment-method";
import type { BillingOperation } from "./operationJournal";

export const CANCELLED_COLLECTION_ROLES = [
  "admin",
  "manager",
  "jefe_recepcion",
];
const cents = (v: unknown) => Math.round(Number(v) * 100);
/** A cancelled invoice is not evidence that money was never received. Only
 * offer an explicit, exact-source correction; GET never reverses a payment. */
export async function cancelledReceptionCollection(
  executor: any,
  operation: BillingOperation,
  invoice: any,
) {
  const recovery = operation.request_snapshot?.prefacturaRecovery;
  const expected = recovery?.payments;
  if (
    operation.owner_type !== "reservation" ||
    invoice?.estado !== "anulada" ||
    String(invoice.reserva_id) !== operation.owner_id ||
    Number(operation.invoice_id) !== Number(invoice.id) ||
    recovery?.version !== 2 ||
    !Array.isArray(expected) ||
    !expected.length ||
    expected.length > 20 ||
    expected.some(
      (p) =>
        !p ||
        typeof p !== "object" ||
        typeof p.paymentRequestId !== "string" ||
        !p.paymentRequestId ||
        p.unlinkedAdvance ||
        String(p.reservationId) !== operation.owner_id ||
        !(Number(p.amount) > 0),
    ) ||
    new Set(expected.map((p) => p.paymentRequestId)).size !== expected.length ||
    cents(invoice.monto_total) <= 0 ||
    cents(invoice.monto_acreditado) !== cents(invoice.monto_total) ||
    expected.reduce((n, p) => n + cents(p.amount), 0) >
      cents(invoice.monto_total)
  )
    return null;
  const notes = (
    await executor.execute(sql`SELECT id,estado,monto_total,monto_acreditado,reconciliation_status FROM sales_invoices
    WHERE reserva_id=${operation.owner_id} AND nota_credito_id=${Number(invoice.id)} AND tipo_comprobante IN ('NCA','NCB','NCC','NCT','NCM','NCMB') ORDER BY id`)
  ).rows as any[];
  if (
    !notes.length ||
    notes.some(
      (n) =>
        !Number.isFinite(Number(n.monto_total)) ||
        !Number.isFinite(Number(n.monto_acreditado || 0)) ||
        cents(n.monto_total) < 0 ||
        cents(n.monto_acreditado || 0) < 0 ||
        cents(n.monto_acreditado || 0) > cents(n.monto_total) ||
        n.reconciliation_status !== "conciliada" ||
        !["emitida", "parcial", "anulada"].includes(n.estado),
    ) ||
    notes.reduce(
      (n, r) =>
        n +
        (r.estado === "anulada"
          ? 0
          : cents(r.monto_total) - cents(r.monto_acreditado || 0)),
      0,
    ) !== cents(invoice.monto_total)
  )
    return null;
  const reservation = (
    await executor.execute(
      sql`SELECT id,status FROM reservations WHERE id=${operation.owner_id}`,
    )
  ).rows[0] as any;
  if (!reservation || !["confirmed", "checked_in"].includes(reservation.status))
    return null;
  if (
    (
      await executor.execute(
        sql`SELECT 1 FROM group_reservation_links WHERE reservation_id=${operation.owner_id} LIMIT 1`,
      )
    ).rows.length
  )
    return null;
  const pending = (
    await executor.execute(sql`SELECT id FROM sales_invoices WHERE reserva_id=${operation.owner_id}
    AND (estado='autorizacion_pendiente' OR (reconciliation_status IN ('pendiente','error','requiere_revision') AND credit_reapplication_intent IS NOT NULL)) LIMIT 1`)
  ).rows;
  if (pending.length) return null;
  const invoices = (
    await executor.execute(
      sql`SELECT id,tipo_comprobante,punto_venta,numero,monto_total,monto_acreditado,estado FROM sales_invoices WHERE reserva_id=${operation.owner_id}`,
    )
  ).rows as any[];
  const payments = (
    await executor.execute(
      sql`SELECT * FROM payments WHERE reservation_id=${operation.owner_id} ORDER BY id`,
    )
  ).rows as any[];
  const available = new Map(
    getAvailableReservationAdvancePayments(payments, invoices).map((p) => [
      p.id,
      cents(p.availableAdvanceAmount),
    ]),
  );
  const selected: any[] = [];
  for (const wanted of expected) {
    const rows = payments.filter(
      (p) => p.payment_request_id === wanted.paymentRequestId,
    );
    const p = rows[0],
      ref = parseReservationInvoiceRef(p?.invoice_ref);
    if (
      rows.length !== 1 ||
      !p ||
      !["active", "anulado"].includes(p.status) ||
      p.group_payment_id ||
      p.invoice_link_failed ||
      ![
        "cash",
        "debit_card",
        "credit_card",
        "transfer",
        "mercadopago",
      ].includes(classifyReservationPaymentMethod(p.method).method) ||
      cents(p.amount) !== cents(wanted.amount) ||
      p.method !== wanted.method ||
      String(p.date) !== wanted.date ||
      String(p.reference ?? "") !== String(wanted.reference ?? "") ||
      String(p.notes ?? "") !== String(wanted.notes ?? "") ||
      Number(ref?.id) !== Number(invoice.id) ||
      (p.status === "active" && (available.get(p.id) ?? 0) !== cents(p.amount))
    )
      return null;
    const held = (
      await executor.execute(sql`SELECT id FROM sales_invoices WHERE estado IN ('autorizacion_pendiente','emitida')
      AND reconciliation_status IN ('pendiente','error','requiere_revision') AND credit_reapplication_intent IS NOT NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(credit_reapplication_intent->'payments','[]'::jsonb) || COALESCE(credit_reapplication_intent->'ordinaryAdvances','[]'::jsonb)) a WHERE a->>'paymentId'=${p.id}) LIMIT 1`)
    ).rows;
    if (held.length) return null;
    const cash = (
      await executor.execute(
        sql`SELECT cm.*,cs.status AS shift_status FROM cash_movements cm LEFT JOIN cash_shifts cs ON cs.id=cm.shift_id WHERE cm.payment_id=${p.id} ORDER BY cm.id`,
      )
    ).rows as any[];
    const incomes = cash.filter(
      (c) => c.movement_type === "income" && !c.anulado,
    );
    const original = incomes[0];
    if (
      incomes.length !== 1 ||
      !original ||
      cents(original.amount) !== cents(p.amount) ||
      original.source_type !== "reservation" ||
      original.source_id !== operation.owner_id ||
      classifyReservationPaymentMethod(original.payment_method).method !==
        classifyReservationPaymentMethod(p.method).method ||
      !["open", "closed"].includes(original.shift_status)
    )
      return null;
    if (
      cash.some(
        (c) =>
          c.id !== original.id &&
          !(
            c.movement_type === "expense" &&
            c.source_type === "payment_void" &&
            c.source_id === p.id &&
            !c.anulado
          ),
      )
    )
      return null;
    const fm = (
      await executor.execute(sql`SELECT m.id,m.amount,m.type,m.voided_movement_id FROM folio_movements m JOIN folios f ON f.id=m.folio_id
      WHERE f.entity_type='reservation' AND f.entity_id=${operation.owner_id} AND ((m.type='payment' AND m.source_type='payment' AND m.source_id=${p.id}) OR m.type='void')`)
    ).rows as any[];
    const originals = fm.filter((m) => m.type === "payment");
    if (
      originals.length !== 1 ||
      cents(originals[0].amount) !== cents(p.amount)
    )
      return null;
    const reversals = cash.filter(
      (c) =>
        c.movement_type === "expense" &&
        c.source_type === "payment_void" &&
        c.source_id === p.id &&
        !c.anulado,
    );
    const voids = fm.filter(
      (m) => m.type === "void" && m.voided_movement_id === originals[0].id,
    );
    if (
      p.status === "anulado"
        ? reversals.length !== 1 ||
          voids.length !== 1 ||
          cents(reversals[0].amount) !== cents(p.amount) ||
          cents(voids[0].amount) !== -cents(p.amount)
        : reversals.length !== 0 || voids.length !== 0
    )
      return null;
    selected.push({
      id: p.id,
      amount: Number(p.amount),
      method: p.method,
      status: p.status,
      shiftClosed: original.shift_status === "closed",
      cashId: original.id,
      folioMovementId: originals[0].id,
      invoiceRef: p.invoice_ref,
    });
  }
  const fingerprint = hash({
    operationId: operation.operation_id,
    payloadHash: operation.payload_hash,
    invoice: invoice.id,
    notes,
    selected,
  });
  return {
    fingerprint,
    invoiceId: Number(invoice.id),
    invoiceLabel: `${invoice.tipo_comprobante} ${String(invoice.punto_venta).padStart(4, "0")}-${String(invoice.numero).padStart(8, "0")}`,
    total: selected.reduce((n, p) => n + cents(p.amount), 0) / 100,
    payments: selected.map(({ id, amount, method, status, shiftClosed }) => ({
      id,
      amount,
      method,
      status,
      shiftClosed,
    })),
  };
}
