import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { cashMovements } from "@shared/schema";
import { classifyReservationPaymentMethod } from "./payment-method";
import type { db } from "./db";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Shared atomic reversal; callers own the transaction and reservation lock. */
export async function voidReservationPaymentWithLedger(
  tx: Transaction,
  paymentId: string,
  operator: string,
  reason: string,
): Promise<{ alreadyVoided: boolean; paymentId: string }> {
  // Shift lock comes first, matching closeShift/payment creation. The
  // payment/event are re-read only after the owning shift is stable.
  await tx.execute(sql`
        SELECT cs.id FROM cash_shifts cs
        JOIN cash_movements cm ON cm.shift_id = cs.id
        WHERE cm.payment_id = ${paymentId}
        ORDER BY cs.id FOR UPDATE OF cs
      `);
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`reservation-payment-void:${paymentId}`}))`,
  );
  const paymentResult = await tx.execute(
    sql`SELECT * FROM payments WHERE id = ${paymentId} FOR UPDATE`,
  );
  const payment = paymentResult.rows[0] as any;
  if (!payment)
    throw Object.assign(new Error("Pago no encontrado"), { statusCode: 404 });
  const classification = classifyReservationPaymentMethod(payment.method);
  const linked = await tx.execute(sql`
        SELECT * FROM cash_movements WHERE payment_id = ${paymentId} FOR UPDATE
      `);
  if (payment.status === "anulado") {
    return { alreadyVoided: true, paymentId };
  }
  const informational = classification.informational;
  if (informational) {
    const activeInfo = (linked.rows as any[]).filter(
      (m) => m.movement_type === "informational" && !m.anulado,
    );
    if (!activeInfo.length) {
      throw Object.assign(
        new Error(
          "La liquidación no monetaria no tiene movimiento informativo activo",
        ),
        { statusCode: 409 },
      );
    }
    if (classification.method === "current_account") {
      const durableReferences = new Set<string>();
      if (payment.reference) durableReferences.add(String(payment.reference));
      if (payment.invoice_ref) {
        durableReferences.add(String(payment.invoice_ref));
        try {
          const invoice = JSON.parse(payment.invoice_ref);
          if (invoice.reference)
            durableReferences.add(String(invoice.reference));
          if (
            invoice.tipoComprobante &&
            invoice.puntoVenta != null &&
            invoice.numero != null
          ) {
            durableReferences.add(
              `${invoice.tipoComprobante}-${String(invoice.puntoVenta).padStart(4, "0")}-${String(invoice.numero).padStart(8, "0")}`,
            );
          }
        } catch {
          throw Object.assign(
            new Error("La referencia de factura del pago CC es inválida"),
            { statusCode: 409 },
          );
        }
      }
      if (!durableReferences.size) {
        throw Object.assign(
          new Error("El pago CC no tiene referencia documental durable"),
          { statusCode: 409 },
        );
      }
      const refs = Array.from(durableReferences);
      const cargo = await tx.execute(sql`
            SELECT * FROM account_movements
            WHERE reservation_id = ${payment.reservation_id} AND type = 'cargo'
              AND amount::numeric = ${payment.amount}::numeric
              AND reference IN (${sql.join(
                refs.map((reference) => sql`${reference}`),
                sql`, `,
              )})
            FOR UPDATE
          `);
      if (cargo.rows.length !== 1) {
        throw Object.assign(
          new Error("El cargo CC exacto no existe o no es unívoco"),
          { statusCode: 409 },
        );
      }
      const c = cargo.rows[0] as any;
      const voidReference = `void:${paymentId}`;
      const reversal = await tx.execute(sql`
            SELECT id FROM account_movements
            WHERE entity_type = ${c.entity_type} AND entity_id = ${c.entity_id}
              AND reference = ${voidReference} FOR UPDATE
          `);
      if (!reversal.rows.length) {
        await tx.execute(sql`
              INSERT INTO account_movements
                (entity_type, entity_id, date, type, description, amount, reservation_id,
                 reference, payment_method, created_by)
              VALUES (${c.entity_type}, ${c.entity_id}, CURRENT_DATE, 'ajuste',
                ${`Anulación cargo CC — ${reason}`}, (-${c.amount}::numeric),
                ${payment.reservation_id}, ${voidReference}, 'current_account', ${operator})
            `);
      }
    }
    await tx.execute(sql`
          UPDATE cash_movements
          SET anulado = true, motivo_anulacion = ${reason}, anulado_por = ${operator}, anulado_at = NOW()
          WHERE payment_id = ${paymentId} AND movement_type = 'informational' AND anulado = false
        `);
    for (const event of activeInfo) {
      const shift = await tx.execute(
        sql`SELECT status FROM cash_shifts WHERE id = ${event.shift_id} FOR UPDATE`,
      );
      if ((shift.rows[0] as any)?.status === "closed") {
        await tx.execute(sql`
              UPDATE cash_closing_summaries SET
                total_current_account = GREATEST(0, COALESCE(total_current_account, 0) - CASE WHEN ${classification.method} = 'current_account' THEN ${event.amount}::numeric ELSE 0 END),
                total_voucher = GREATEST(0, COALESCE(total_voucher, 0) - CASE WHEN ${classification.method} = 'voucher' THEN ${event.amount}::numeric ELSE 0 END),
                non_cash_settlements_total = GREATEST(0, COALESCE(non_cash_settlements_total, 0) - ${event.amount}::numeric),
                non_cash_settlements_count = GREATEST(0, COALESCE(non_cash_settlements_count, 0) - 1)
              WHERE shift_id = ${event.shift_id}
            `);
      }
    }
  } else {
    // Existing physical-cash behavior: preserve a linked expense reversal.
    const activeIncome = (linked.rows as any[]).find(
      (m) => m.movement_type === "income" && !m.anulado,
    );
    if (activeIncome) {
      await tx.insert(cashMovements).values({
        id: randomUUID(),
        shiftId: activeIncome.shift_id,
        area: activeIncome.area,
        sourceType: "payment_void",
        sourceId: paymentId,
        sourceLabel: `Anulación pago ${payment.method}`,
        paymentMethod: classification.method,
        amount: payment.amount,
        movementType: "expense",
        registeredBy: operator,
        paymentId,
      } as any);
    }
  }
  const folio = await tx.execute(sql`
        SELECT id FROM folios WHERE entity_type = 'reservation' AND entity_id = ${payment.reservation_id}
        LIMIT 1 FOR UPDATE
      `);
  if (folio.rows[0]) {
    const originalFolioPayment = await tx.execute(sql`
          SELECT id FROM folio_movements
          WHERE folio_id = ${(folio.rows[0] as any).id}
            AND type = 'payment'
            AND source_type = 'payment'
            AND source_id = ${paymentId}
          LIMIT 2 FOR UPDATE
        `);
    if (originalFolioPayment.rows.length !== 1) {
      throw Object.assign(
        new Error(
          "El movimiento de pago original del folio no existe o no es unívoco",
        ),
        { statusCode: 409 },
      );
    }
    const originalFolioMovementId = (originalFolioPayment.rows[0] as any).id;
    const existingVoid = await tx.execute(sql`
          SELECT id FROM folio_movements
          WHERE folio_id = ${(folio.rows[0] as any).id} AND type = 'void'
            AND voided_movement_id = ${originalFolioMovementId} FOR UPDATE
        `);
    if (!existingVoid.rows.length) {
      await tx.execute(sql`
            INSERT INTO folio_movements
              (folio_id, type, amount, description, voided_movement_id, void_reason, registered_by)
            VALUES (${(folio.rows[0] as any).id}, 'void', ${(-Number(payment.amount)).toFixed(2)},
              ${`Anulación pago — ${reason}`}, ${originalFolioMovementId}, ${reason}, ${operator})
          `);
    }
    await tx.execute(sql`
          UPDATE folios f SET
            total_charges = COALESCE((SELECT SUM(amount::numeric) FROM folio_movements
              WHERE folio_id = f.id AND type IN ('charge','transfer_in')), 0),
            total_payments = COALESCE((SELECT SUM(amount::numeric) FROM folio_movements
              WHERE folio_id = f.id AND type IN ('payment','advance','discount','transfer_out','void')), 0)
          WHERE f.id = ${(folio.rows[0] as any).id}
        `);
    await tx.execute(sql`
          UPDATE folios SET balance = total_charges::numeric - total_payments::numeric
          WHERE id = ${(folio.rows[0] as any).id}
        `);
  }
  await tx.execute(sql`
        UPDATE payments SET status = 'anulado', anulado_por = ${operator},
          motivo_anulacion = ${reason}, anulado_at = NOW()
        WHERE id = ${paymentId} AND status IS DISTINCT FROM 'anulado'
      `);
  return { alreadyVoided: false, paymentId };
}
