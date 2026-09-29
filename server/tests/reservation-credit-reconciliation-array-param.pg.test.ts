import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../db";
import { prepareReservationCreditIntent, reconcileReservationCreditInvoice } from "../billing/reservationCreditReconciliation";

// Regresión: `WHERE id = ANY(${sourceIds}::int[])` con un JS array interpolado
// directo en el `sql` de drizzle-orm no se serializa como literal de array de
// Postgres — para 1 elemento tira "malformed array literal", para 2+ tira
// "cannot cast type record to ...[]". Rompía, entre otros, el flujo real que
// dispara esto: reaplicar un anticipo cuya factura original ya tiene una NC
// (justo lo que hace un usuario al intentar emitir/acreditar sobre una
// reserva con un único anticipo previamente facturado y luego acreditado).
const suite = process.env.DATABASE_URL ? describe : describe.skip;

suite("reservation credit reconciliation — array param regression", () => {
  it("reaplica un único anticipo con factura original acreditada (antes: malformed array literal)", async () => {
    const reservationId = `res-${randomUUID()}`;
    const paymentId = randomUUID();
    let invoiceId!: number;

    try {
      await db.transaction(async (tx) => {
        const inserted = await tx.execute(sql`
          INSERT INTO sales_invoices (
            tipo_comprobante, punto_venta, numero, fecha_emision,
            cliente_razon_social, cliente_condicion_iva,
            monto_neto, monto_total, monto_acreditado, estado, reserva_id
          ) VALUES (
            'FA', 1, 1, CURRENT_DATE,
            'Cliente de prueba', 'Consumidor Final',
            1000.00, 1000.00, 1000.00, 'emitida', ${reservationId}
          ) RETURNING id
        `);
        invoiceId = Number((inserted.rows[0] as any).id);

        await tx.execute(sql`
          INSERT INTO payments (id, reservation_id, amount, method, date, status, invoice_ref)
          VALUES (
            ${paymentId}, ${reservationId}, '1000.00', 'efectivo', CURRENT_DATE, 'active',
            ${JSON.stringify({ id: invoiceId, tipoComprobante: "FA", puntoVenta: 1, numero: 1, total: "1000.00" })}
          )
        `);

        const draft: any = { montoTotal: "1000.00" };
        const hook = prepareReservationCreditIntent(reservationId, {
          operationId: `op-${randomUUID()}`,
          invoiceTotal: 1000,
          payments: [{ paymentId, amount: 1000 }],
          status: "pending",
        });

        await hook(tx, draft);

        expect(draft.creditReapplicationIntent).toMatchObject({
          payments: [{ paymentId, amount: 1000 }],
          status: "pending",
        });

        // Persistir el intent y confirmar el segundo call-site afectado
        // (reconcileReservationCreditInvoice) reusando la misma factura como
        // "nueva" — solo se ejercita la consulta por array, no la conciliación
        // de negocio completa.
        await tx.execute(sql`
          UPDATE sales_invoices SET credit_reapplication_intent = ${JSON.stringify(draft.creditReapplicationIntent)}::jsonb
          WHERE id = ${invoiceId}
        `);
      });

      await expect(reconcileReservationCreditInvoice(invoiceId)).resolves.toBeTruthy();
    } finally {
      await db.execute(sql`DELETE FROM payments WHERE id = ${paymentId}`);
      if (invoiceId) await db.execute(sql`DELETE FROM sales_invoices WHERE id = ${invoiceId}`);
    }
  });
});
