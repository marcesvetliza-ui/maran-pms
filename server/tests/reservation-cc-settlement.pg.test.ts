import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";

const configured = Boolean(process.env.DATABASE_URL);
const suite = configured ? describe : describe.skip;
const pool = configured ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 }) : null;

suite("PostgreSQL: canonical reservation Cuenta Corriente settlement", () => {
  afterAll(async () => { await pool?.end(); });

  it("is one payment/folio cargo under sequential and concurrent retries, with no Caja", async () => {
    if (!pool) return;
    const id = `cc-settlement-${randomUUID()}`;
    const invoiceRef = JSON.stringify({ id: 991234, tipoComprobante: "FB", puntoVenta: 1, numero: 991234 });
    const reference = "FB-00991234";
    await pool.query(
      `INSERT INTO reservations
       (id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,created_at)
       VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,CURRENT_DATE+1,'confirmed',NOW())`,
      [id, `CC-${id}`, `guest-${id}`, `type-${id}`, `room-${id}`],
    );
    await pool.query(
      `INSERT INTO sales_invoices
       (tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,
        cliente_condicion_iva,monto_neto,monto_total,estado,reserva_id,items)
       VALUES ('FB',1,991234,CURRENT_DATE,'CC Test','Consumidor Final',100000,100000,'emitida',$1,'[]'::jsonb)
       RETURNING id`,
      [id],
    );
    const shiftId = `cc-shift-${randomUUID()}`;
    await pool.query(
      `INSERT INTO cash_shifts (id, area, shift_number, opened_at, status)
       VALUES ($1, 'reception', floor(random()*1000000)::int, NOW(), 'open')`,
      [shiftId],
    );
    const invoice = await pool.query("SELECT id FROM sales_invoices WHERE reserva_id=$1 ORDER BY id DESC LIMIT 1", [id]);
    const invoiceId = Number(invoice.rows[0].id);
    const input = {
      payment: {
        reservationId: id, amount: "100000.00", method: "cuenta_corriente",
        date: "2026-01-01", reference, invoiceRef, notes: "CC canonical",
      } as any,
      sourceLabel: "CC canonical",
      accountSettlement: {
        entityType: "company" as const, entityId: `company-${id}`,
        description: "FB-00991234", reference, invoiceId,
      },
    };
    try {
      const first = await storage.createReservationPaymentWithLedger(input);
      const second = await storage.createReservationPaymentWithLedger(input);
      const concurrent = await Promise.all([
        storage.createReservationPaymentWithLedger(input),
        storage.createReservationPaymentWithLedger(input),
      ]);
      expect(new Set([first.id, second.id, ...concurrent.map(p => p.id)])).toHaveLength(1);
      const payments = await pool.query(
        "SELECT id FROM payments WHERE reservation_id=$1 AND method='cuenta_corriente' AND status <> 'anulado'", [id],
      );
      const folio = await pool.query(
        `SELECT fm.source_id FROM folio_movements fm JOIN folios f ON f.id=fm.folio_id
         WHERE f.entity_id=$1 AND fm.type='payment'`, [id],
      );
      const cargos = await pool.query(
        "SELECT id FROM account_movements WHERE reservation_id=$1 AND reference=$2 AND type='cargo'", [id, reference],
      );
      const cash = await pool.query("SELECT id, movement_type, payment_method, amount FROM cash_movements WHERE payment_id=$1", [first.id]);
      const linked = await pool.query("SELECT payment_id FROM sales_invoices WHERE id=$1", [invoiceId]);
      expect(payments.rows).toHaveLength(1);
      expect(folio.rows).toHaveLength(1);
      expect(cargos.rows).toHaveLength(1);
      expect(cash.rows).toHaveLength(1);
      expect(cash.rows[0]).toMatchObject({ movement_type: "informational", payment_method: "current_account", amount: "100000.00" });
      expect(linked.rows[0].payment_id).toBe(first.id);
    } finally {
      await pool.query("DELETE FROM account_movements WHERE reservation_id=$1", [id]);
      await pool.query("DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_id=$1)", [id]);
      await pool.query("DELETE FROM folios WHERE entity_id=$1", [id]);
      await pool.query("DELETE FROM payments WHERE reservation_id=$1", [id]);
      await pool.query("DELETE FROM sales_invoices WHERE id=$1", [invoiceId]);
      await pool.query("DELETE FROM reservations WHERE id=$1", [id]);
      await pool.query("DELETE FROM cash_shifts WHERE id=$1", [shiftId]);
    }
  });
});