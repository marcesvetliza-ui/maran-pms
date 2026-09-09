import { sql } from "drizzle-orm";
import { db } from "../db";
import { getAvailableReservationAdvancePayments, parseReservationInvoiceRef } from "@shared/reservationFolio";

export type ReservationCreditAllocation = {
  paymentId: string;
  amount: number;
};

export type ReservationCreditIntent = {
  operationId: string;
  invoiceTotal: number;
  payments: ReservationCreditAllocation[];
  status: "pending" | "completed";
  [key: string]: unknown;
};

type Transaction = any;

function money(value: unknown): number {
  return Number(Number(value).toFixed(2));
}

const NUMERIC_SNAPSHOT_FIELDS = new Set([
  "amount", "invoiceTotal", "cantidad", "precioUnitario", "subtotalNeto", "subtotal",
]);

export function normalizeCreditSnapshot(value: any, field = ""): any {
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => normalizeCreditSnapshot(entry, field));
    if (normalized.every((row) => row && typeof row === "object" && "paymentId" in row)) {
      return normalized.sort((a, b) => String(a.paymentId).localeCompare(String(b.paymentId)));
    }
    if (field === "sourceChargeIds") return normalized.sort();
    return normalized;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).filter((key) => key !== "status" && key !== "operationId" && key !== "error").sort()
        .map((key) => [key, normalizeCreditSnapshot(value[key], key)]),
    );
  }
  if (typeof value === "number" || (NUMERIC_SNAPSHOT_FIELDS.has(field) && value !== "")) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? money(numeric) : value;
  }
  return value;
}

export function equalCreditSnapshots(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeCreditSnapshot(left)) === JSON.stringify(normalizeCreditSnapshot(right));
}

export function getUncoveredReservationSettlement(
  invoiceTotal: unknown,
  allocations: Array<{ amount?: unknown }> = [],
): number {
  const total = Number(invoiceTotal);
  const applied = allocations.reduce((sum, row) => sum + (Number(row?.amount) || 0), 0);
  return Number(Math.max(0, (Number.isFinite(total) ? total : 0) - applied).toFixed(2));
}

function invoiceIdsForPayment(payment: any): number[] {
  const ref = parseReservationInvoiceRef(payment.invoice_ref);
  if (!ref) return [];
  return [ref.id, ...(Array.isArray(ref.reapplications) ? ref.reapplications.map((row: any) => row?.invoiceId) : [])]
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

function originalInvoiceIdForPayment(payment: any): number | null {
  const id = Number(parseReservationInvoiceRef(payment.invoice_ref)?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Builds the invoice draft hook which takes the durable credit hold. All
 * availability checks and the insert commit (or roll back) as one operation.
 */
export function prepareReservationCreditIntent(
  reservationId: string,
  intent: ReservationCreditIntent,
) {
  return async (tx: Transaction, draft: any): Promise<void> => {
    const allocations = intent.payments
      .map((row) => ({ paymentId: String(row.paymentId), amount: money(row.amount) }))
      .sort((a, b) => a.paymentId.localeCompare(b.paymentId));
    if (!allocations.length ||
        allocations.some((row) => !row.paymentId || !Number.isFinite(row.amount) || row.amount <= 0) ||
        new Set(allocations.map((row) => row.paymentId)).size !== allocations.length) {
      throw new Error("Selección de crédito inválida");
    }
    const draftTotal = money(draft.montoTotal);
    const aggregate = money(allocations.reduce((sum, row) => sum + row.amount, 0));
    if (!Number.isFinite(draftTotal) || aggregate > draftTotal) {
      throw new Error("El crédito supera el total persistido de la factura");
    }

    const locked: any[] = [];
    for (const allocation of allocations) {
      const result = await tx.execute(sql`
        SELECT id, reservation_id, method, status, amount, invoice_ref, invoice_link_failed
        FROM payments WHERE id = ${allocation.paymentId} FOR UPDATE
      `);
      const payment = result.rows[0] as any;
      if (!payment || String(payment.reservation_id) !== reservationId ||
          payment.status !== "active" || payment.invoice_link_failed ||
          ["cuenta_corriente", "current_account"].includes(String(payment.method))) {
        throw new Error("El crédito no pertenece a la reserva o no está disponible");
      }
      if (!originalInvoiceIdForPayment(payment)) {
        throw new Error("El pago no conserva una factura original válida con crédito liberado");
      }
      locked.push(payment);
    }

    const unresolved = await tx.execute(sql`
      SELECT credit_reapplication_intent
      FROM sales_invoices
      WHERE reserva_id = ${reservationId}
        AND estado IN ('autorizacion_pendiente', 'emitida')
        AND reconciliation_status IN ('pendiente', 'error', 'requiere_revision')
        AND credit_reapplication_intent IS NOT NULL
        AND credit_reapplication_intent->>'operationId' <> ${intent.operationId}
      FOR UPDATE
    `);
    const sourceIds = [...new Set(locked.flatMap(invoiceIdsForPayment))];
    const sources = sourceIds.length
      ? await tx.execute(sql`
          SELECT id, reserva_id, tipo_comprobante, punto_venta, numero, monto_total, monto_acreditado, estado
          FROM sales_invoices WHERE id = ANY(${sourceIds}::int[]) ORDER BY id FOR UPDATE
        `)
      : { rows: [] };

    for (let index = 0; index < allocations.length; index++) {
      const allocation = allocations[index];
      const originalId = originalInvoiceIdForPayment(locked[index]);
      const original = (sources.rows as any[]).find((row) => Number(row.id) === originalId);
      if (!original || String(original.reserva_id) !== reservationId ||
          !["FA", "FB", "FC", "FT", "FM"].includes(String(original.tipo_comprobante)) ||
          !(original.estado === "anulada" || Number(original.monto_acreditado) > 0)) {
        throw new Error("El pago no referencia una factura de venta acreditada de la reserva");
      }
      const authoritative = getAvailableReservationAdvancePayments([locked[index]], sources.rows as any[])[0]
        ?.availableAdvanceAmount || 0;
      const held = (unresolved.rows as any[]).reduce((sum, row) => {
        const match = row.credit_reapplication_intent?.payments?.find(
          (candidate: any) => String(candidate?.paymentId) === allocation.paymentId,
        );
        return sum + (Number(match?.amount) || 0);
      }, 0);
      if (allocation.amount > money(Math.max(0, authoritative - held))) {
        throw new Error("El crédito solicitado supera el saldo disponible");
      }
    }

    draft.creditReapplicationIntent = { ...intent, payments: allocations, invoiceTotal: draftTotal, status: "pending" };
  };
}

/** Reconciles only the immutable intent already held by the persisted draft. */
export async function reconcileReservationCreditInvoice(invoiceId: number): Promise<any> {
  try {
    return await db.transaction(async (tx) => {
      const invoiceResult = await tx.execute(sql`
        SELECT * FROM sales_invoices WHERE id = ${invoiceId} FOR UPDATE
      `);
      const invoice = invoiceResult.rows[0] as any;
      const intent = invoice?.credit_reapplication_intent as ReservationCreditIntent | undefined;
      if (!invoice || !intent || !Array.isArray(intent.payments)) {
        throw new Error("La factura no tiene un intento de crédito recuperable");
      }
      if (invoice.estado !== "emitida") throw new Error("La factura todavía no fue emitida");
      if (intent.status === "completed" && invoice.reconciliation_status === "conciliada") return invoice;
      if (money(intent.invoiceTotal) !== money(invoice.monto_total)) {
        throw new Error("El total emitido no coincide con el intento de crédito");
      }
      const allocations = intent.payments
        .map((row) => ({ paymentId: String(row.paymentId), amount: money(row.amount) }))
        .sort((a, b) => a.paymentId.localeCompare(b.paymentId));
      if (money(allocations.reduce((sum, row) => sum + row.amount, 0)) > money(invoice.monto_total)) {
        throw new Error("El crédito conciliado supera el total emitido");
      }
      const lockedPayments: any[] = [];
      for (const allocation of allocations) {
        const result = await tx.execute(sql`SELECT * FROM payments WHERE id = ${allocation.paymentId} FOR UPDATE`);
        const payment = result.rows[0] as any;
        if (!payment || String(payment.reservation_id) !== String(invoice.reserva_id) ||
            payment.status !== "active" || payment.invoice_link_failed ||
            ["cuenta_corriente", "current_account"].includes(String(payment.method))) {
          throw new Error("Un pago del intento ya no está disponible");
        }
        lockedPayments.push(payment);
      }
      const sourceIds = [...new Set(lockedPayments.flatMap(invoiceIdsForPayment))];
      const sourceRows = sourceIds.length
        ? await tx.execute(sql`
            SELECT id, tipo_comprobante, punto_venta, numero, monto_total, monto_acreditado, estado
            FROM sales_invoices WHERE id = ANY(${sourceIds}::int[]) ORDER BY id FOR UPDATE
          `)
        : { rows: [] };
      for (let index = 0; index < allocations.length; index++) {
        const allocation = allocations[index];
        const payment = lockedPayments[index];
        const ref = parseReservationInvoiceRef(payment.invoice_ref);
        if (!ref) throw new Error("Un pago no conserva su comprobante de origen");
        const existing = (Array.isArray(ref.reapplications) ? ref.reapplications : [])
          .find((row: any) => Number(row?.invoiceId) === invoiceId);
        if (existing) {
          if (money(existing.amount) !== allocation.amount) {
            throw new Error("La reaplicación existente tiene un importe distinto");
          }
          continue;
        }
        const available = getAvailableReservationAdvancePayments([payment], sourceRows.rows as any[])[0]
          ?.availableAdvanceAmount || 0;
        if (allocation.amount > money(available)) {
          throw new Error("El crédito del intento supera el saldo disponible");
        }
        const entry = {
          invoiceId,
          tipoComprobante: invoice.tipo_comprobante,
          amount: allocation.amount,
        };
        await tx.execute(sql`
          UPDATE payments
          SET invoice_ref = jsonb_set(
            invoice_ref::jsonb, '{reapplications}',
            COALESCE(invoice_ref::jsonb->'reapplications', '[]'::jsonb) || ${JSON.stringify(entry)}::jsonb
          )::text
          WHERE id = ${allocation.paymentId}
        `);
      }
      const completed = { ...intent, payments: allocations, status: "completed" };
      const updated = await tx.execute(sql`
        UPDATE sales_invoices
        SET reconciliation_status = 'conciliada', reconciliation_error = NULL,
            reconciliation_updated_at = now(), credit_reapplication_intent = ${JSON.stringify(completed)}::jsonb
        WHERE id = ${invoiceId}
        RETURNING *
      `);
      return updated.rows[0];
    });
  } catch (error: any) {
    await db.execute(sql`
      UPDATE sales_invoices
      SET reconciliation_status = 'pendiente',
          reconciliation_error = ${String(error?.message || error)},
          reconciliation_updated_at = now()
      WHERE id = ${invoiceId}
    `).catch(() => undefined);
    throw error;
  }
}

export async function assertPaymentHasNoUnresolvedCreditHold(paymentId: string): Promise<void> {
  const held = await db.execute(sql`
    SELECT 1 FROM sales_invoices
    WHERE estado IN ('autorizacion_pendiente', 'emitida')
      AND reconciliation_status IN ('pendiente', 'error', 'requiere_revision')
      AND credit_reapplication_intent IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(credit_reapplication_intent->'payments') allocation
        WHERE allocation->>'paymentId' = ${paymentId}
      )
    LIMIT 1
  `);
  if (held.rows.length) {
    const error: any = new Error("El pago participa en una factura con reaplicación de crédito pendiente");
    error.statusCode = 409;
    throw error;
  }
}