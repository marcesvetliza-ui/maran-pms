/**
 * Edición de la forma de pago de una factura de Grupo — storage.
 * recordGroupPayment (la "fusión atómica factura+cobro") crea un
 * group_payments (recibo padre), N filas de payments (una por reserva
 * asignada) y una fila de cash_movements por método (source_type=
 * 'group_payment', source_id=groupId, area='reception', payment_id=
 * group_payments.id) — Grupos no tiene folio. Este test arma esas filas
 * directamente (el circuito de creación ya está probado en
 * group-distribution-payment-cash-reversal.pg.test.ts) para poner a prueba
 * específicamente PATCH /api/billing/invoices/:id → editGroupInvoiceCashMethod:
 * debe anular y rehacer las N filas de payments Y la de cash_movements,
 * juntas, con el mismo contraasiento de auditoría (status='anulado') que ya
 * usa payments.anular en Reservas.
 */

import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../billing/billingConfig", async (importOriginal) => {
  const original = await importOriginal<typeof import("../billing/billingConfig")>();
  return { ...original, getBillingConfig: async () => ({ ...(await original.getBillingConfig()), arcaAmbiente: "ficticio" }) };
});

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let server: http.Server;
let baseUrl: string;

async function request(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}

type Fixture = {
  groupId: string;
  reservationIds: string[];
  cashShiftId: string;
  groupPaymentId: string;
  invoiceId: number;
};

async function createFixture(reservationAmounts: number[], method: string): Promise<Fixture> {
  const suffix = randomUUID();
  const groupId = `pg-group-cash-edit-group-${suffix}`;
  const cashShiftId = `pg-group-cash-edit-shift-${suffix}`;
  const groupPaymentId = randomUUID();
  const total = reservationAmounts.reduce((sum, amount) => sum + amount, 0);

  await pool!.query(
    `INSERT INTO groups (id, group_code, name, check_in_date, check_out_date, status, master_folio_config, created_at)
     VALUES ($1, $2, 'Prueba edición forma de pago Grupo', DATE '2026-08-26', DATE '2026-08-27', 'confirmed', 'accommodation', NOW())`,
    [groupId, `PGGCE-${suffix}`],
  );
  await pool!.query(
    `INSERT INTO cash_shifts (id, area, shift_number, opened_by, opened_at, status, notes, created_at)
     VALUES ($1, 'reception', 999998, 'pg-test', NOW(), 'open', 'fixture group cash edit', NOW())`,
    [cashShiftId],
  );

  const reservationIds: string[] = [];
  for (const [index, amount] of reservationAmounts.entries()) {
    const reservationId = `pg-group-cash-edit-res-${index}-${suffix}`;
    reservationIds.push(reservationId);
    await pool!.query(
      `INSERT INTO reservations (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, total_room_amount, status, created_at)
       VALUES ($1, $2, $3, $4, $5, DATE '2026-08-26', DATE '2026-08-27', $6, 'confirmed', NOW())`,
      [reservationId, `PGGCE-RES-${index}-${suffix}`, `guest-${index}-${suffix}`, `type-${index}-${suffix}`, `room-${index}-${suffix}`, amount.toFixed(2)],
    );
    await pool!.query(
      `INSERT INTO group_reservation_links (id, group_id, reservation_id) VALUES ($1, $2, $3)`,
      [`pg-group-cash-edit-link-${index}-${suffix}`, groupId, reservationId],
    );
    await pool!.query(
      `INSERT INTO payments (id, reservation_id, amount, method, date, status, group_payment_id)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, 'active', $5)`,
      [randomUUID(), reservationId, amount.toFixed(2), method, groupPaymentId],
    );
  }

  await pool!.query(
    `INSERT INTO group_payments (id, group_id, amount, method, date, payment_method_detail, destination)
     VALUES ($1, $2, $3, $4, CURRENT_DATE, $5::jsonb, 'group_distribution')`,
    [groupPaymentId, groupId, total.toFixed(2), method, JSON.stringify([{ method, amount: total, reference: null }])],
  );
  await pool!.query(
    `INSERT INTO cash_movements (id, shift_id, area, source_type, source_id, payment_method, amount, movement_type, payment_id, receipt_number)
     VALUES ($1, $2, 'reception', 'group_payment', $3, $4, $5, 'income', $6, nextval('cash_movements_receipt_number_seq'::regclass)::text)`,
    [randomUUID(), cashShiftId, groupId, method, total.toFixed(2), groupPaymentId],
  );

  const { emitirFactura } = await import("../billing/invoiceService");
  const invoice = await emitirFactura({
    tipoComprobante: "FB",
    cliente: { razonSocial: "Empresa Receptora SA", condicionIva: "Responsable Inscripto", cuit: "30-71234567-8" },
    items: [{ descripcion: "Alojamiento grupal", cantidad: 1, precioUnitario: total, alicuotaIva: "21", subtotalNeto: total / 1.21, subtotal: total }],
    groupId,
  } as any);
  await pool!.query(`UPDATE sales_invoices SET group_payment_id = $1 WHERE id = $2`, [groupPaymentId, invoice.id]);
  await pool!.query(`UPDATE group_payments SET invoice_id = $1 WHERE id = $2`, [invoice.id, groupPaymentId]);

  return { groupId, reservationIds, cashShiftId, groupPaymentId, invoiceId: Number(invoice.id) };
}

async function cleanup(fixture: Fixture | undefined) {
  if (!fixture) return;
  await pool!.query("DELETE FROM cash_movements WHERE payment_id = $1", [fixture.groupPaymentId]);
  await pool!.query("DELETE FROM sales_invoices WHERE id = $1", [fixture.invoiceId]);
  await pool!.query("DELETE FROM payments WHERE group_payment_id = $1", [fixture.groupPaymentId]);
  await pool!.query("DELETE FROM group_payments WHERE id = $1", [fixture.groupPaymentId]);
  await pool!.query("DELETE FROM group_reservation_links WHERE reservation_id = ANY($1::text[])", [fixture.reservationIds]);
  await pool!.query("DELETE FROM reservations WHERE id = ANY($1::text[])", [fixture.reservationIds]);
  await pool!.query("DELETE FROM groups WHERE id = $1", [fixture.groupId]);
  await pool!.query("DELETE FROM cash_shifts WHERE id = $1", [fixture.cashShiftId]);
}

suite("PostgreSQL real: edición de forma de pago de facturas de Grupo", () => {
  beforeAll(async () => {
    const { registerBillingRoutes } = await import("../billing/routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "group-cash-edit-pg", username: "group-cash-edit-pg", fullName: "Prueba Edición Grupo", role: "admin" };
      req.isAuthenticated = () => true;
      next();
    });
    registerBillingRoutes(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
  });

  it("cambia el medio de pago real y anula/rehace las N filas de payments (una por reserva) junto con cash_movements", async () => {
    if (!pool) return;
    let fixture: Fixture | undefined;
    try {
      fixture = await createFixture([600, 300], "efectivo");

      const oldCash = await pool.query("SELECT id FROM cash_movements WHERE payment_id = $1 AND anulado = false", [fixture.groupPaymentId]);
      expect(oldCash.rows).toHaveLength(1);
      const oldPayments = await pool.query("SELECT id, reservation_id, amount FROM payments WHERE group_payment_id = $1 AND status = 'active' ORDER BY amount DESC", [fixture.groupPaymentId]);
      expect(oldPayments.rows).toHaveLength(2);

      const edited = await request("PATCH", `/api/billing/invoices/${fixture.invoiceId}`, { cashFormaPago: "transferencia" });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(edited.body.cashFormaPago ?? edited.body.cash_forma_pago).toBe("transferencia");

      const oldCashAfter = await pool.query("SELECT anulado, motivo_anulacion FROM cash_movements WHERE id = $1", [oldCash.rows[0].id]);
      expect(oldCashAfter.rows[0]).toMatchObject({ anulado: true, motivo_anulacion: "Edición de forma de pago" });
      const newCash = await pool.query("SELECT payment_method, amount FROM cash_movements WHERE payment_id = $1 AND anulado = false", [fixture.groupPaymentId]);
      expect(newCash.rows).toEqual([{ payment_method: "transferencia", amount: "900.00" }]);

      const oldPaymentsAfter = await pool.query("SELECT status, motivo_anulacion FROM payments WHERE id = ANY($1::text[])", [oldPayments.rows.map((r: any) => r.id)]);
      expect(oldPaymentsAfter.rows).toEqual([
        { status: "anulado", motivo_anulacion: "Edición de forma de pago" },
        { status: "anulado", motivo_anulacion: "Edición de forma de pago" },
      ]);
      const newPayments = await pool.query(
        "SELECT reservation_id, amount, method FROM payments WHERE group_payment_id = $1 AND status = 'active' ORDER BY amount DESC",
        [fixture.groupPaymentId],
      );
      expect(newPayments.rows).toEqual([
        { reservation_id: fixture.reservationIds[0], amount: "600.00", method: "transferencia" },
        { reservation_id: fixture.reservationIds[1], amount: "300.00", method: "transferencia" },
      ]);

      const groupPaymentRow = await pool.query("SELECT method, payment_method_detail FROM group_payments WHERE id = $1", [fixture.groupPaymentId]);
      expect(groupPaymentRow.rows[0].method).toBe("transferencia");
      expect(groupPaymentRow.rows[0].payment_method_detail).toEqual([{ method: "transferencia", amount: 900, reference: null }]);

      const invoiceRow = await pool.query("SELECT cash_forma_pago FROM sales_invoices WHERE id = $1", [fixture.invoiceId]);
      expect(invoiceRow.rows[0].cash_forma_pago).toBe("transferencia");
    } finally {
      await cleanup(fixture);
    }
  });

  it("rechaza cambiar a Cuenta Corriente", async () => {
    if (!pool) return;
    let fixture: Fixture | undefined;
    try {
      fixture = await createFixture([500], "efectivo");
      const edited = await request("PATCH", `/api/billing/invoices/${fixture.invoiceId}`, { cashFormaPago: "cuenta_corriente" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/Cuenta Corriente/);
    } finally {
      await cleanup(fixture);
    }
  });

  it("rechaza editar un pago de Grupo cobrado con más de una forma de pago (varios)", async () => {
    if (!pool) return;
    let fixture: Fixture | undefined;
    try {
      fixture = await createFixture([500], "efectivo");
      await pool.query(
        `UPDATE group_payments SET payment_method_detail = $1::jsonb WHERE id = $2`,
        [JSON.stringify([{ method: "efectivo", amount: 300 }, { method: "transferencia", amount: 200 }]), fixture.groupPaymentId],
      );
      const edited = await request("PATCH", `/api/billing/invoices/${fixture.invoiceId}`, { cashFormaPago: "transferencia" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/más de una forma de pago/);
    } finally {
      await cleanup(fixture);
    }
  });

  it("rechaza editar un pago de Grupo con retención asociada", async () => {
    if (!pool) return;
    let fixture: Fixture | undefined;
    try {
      fixture = await createFixture([500], "transferencia");
      await pool.query(
        `UPDATE group_payments SET payment_method_detail = $1::jsonb WHERE id = $2`,
        [JSON.stringify([{ method: "transferencia", amount: 500, retention: { tipo: "iibb", monto: 10 } }]), fixture.groupPaymentId],
      );
      const edited = await request("PATCH", `/api/billing/invoices/${fixture.invoiceId}`, { cashFormaPago: "efectivo" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/retención/);
    } finally {
      await cleanup(fixture);
    }
  });

  it("rechaza editar una factura ARCA sin ningún circuito reconocido (mantiene el bloqueo previo)", async () => {
    if (!pool) return;
    const { emitirFactura } = await import("../billing/invoiceService");
    let invoiceId: number | undefined;
    try {
      const invoice = await emitirFactura({
        tipoComprobante: "FB",
        cliente: { razonSocial: `Sin grupo ${randomUUID()}`, condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 500, alicuotaIva: "21", subtotalNeto: 413.22, subtotal: 500 }],
        cashFormaPago: "efectivo",
      });
      invoiceId = invoice.id;
      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "transferencia" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/Centro de Comprobantes/);
    } finally {
      if (invoiceId) await pool.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
    }
  });
});
