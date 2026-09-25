/**
 * Edición de la forma de pago de una factura de Recepción (reserva) cobrada
 * con un único medio real de Caja — el circuito "cashArea && cashFormaPago"
 * de POST /api/billing/invoices (server/billing/routes.ts), que solo crea
 * cash_movements (source_type='comprobante') sin tocar payments ni el folio.
 *
 * Alcance acotado a propósito (ver server/billing/reservationInvoicePaymentEdit.ts):
 * solo cambia entre medios reales de Caja. No cubre facturas cobradas a
 * Cuenta Corriente (createReservationPaymentWithLedger también toca
 * folio_movements y el saldo del folio — revertir eso queda para otra vuelta).
 */

import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

async function createReservation(): Promise<string> {
  const reservationId = `res-cash-edit-${randomUUID()}`;
  await pool!.query(
    `INSERT INTO reservations
       (id, reservation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, total_room_amount, status, created_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE + 1, '1000.00', 'checked_in', NOW())`,
    [reservationId, `RCE-${reservationId.slice(-8)}`, `guest-${reservationId}`, `type-${reservationId}`, `room-${reservationId}`],
  );
  return reservationId;
}

async function issuePlainCashInvoice(reservationId: string, method: string) {
  return request("POST", "/api/billing/invoices", {
    tipoComprobante: "FB",
    cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
    items: [{ descripcion: "Alojamiento en Hotel Maran", cantidad: 1, precioUnitario: 1000, alicuotaIva: "21", subtotalNeto: 826.45, subtotal: 1000, catalogItem: { source: "accommodation", id: "alojamiento" } }],
    reservaId: reservationId,
    cashArea: "recepcion",
    cashFormaPago: method,
    cashFormaPagoDetalle: [{ method, amount: 1000 }],
    sourceChargeIds: ["accommodation"],
    sourceChargeAmounts: { accommodation: 1000 },
    folioContext: { billingTarget: "guest", hasAccommodation: true },
  });
}

async function cleanupInvoice(invoiceId: number | undefined, reservationId: string | undefined) {
  if (invoiceId) {
    await pool!.query("DELETE FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
    await pool!.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
  }
  if (reservationId) {
    await pool!.query("DELETE FROM charges WHERE reservation_id = $1", [reservationId]);
    await pool!.query("DELETE FROM payments WHERE reservation_id = $1", [reservationId]);
    await pool!.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
  }
}

suite("PostgreSQL real: edición de forma de pago de facturas de Recepción (reserva)", () => {
  beforeAll(async () => {
    const { registerBillingRoutes } = await import("../billing/routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "res-cash-edit-pg", username: "res-cash-edit-pg", fullName: "Prueba Edición Reserva", role: "admin" };
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

  it("cambia el medio de pago real, anula el cash_movement viejo y crea uno nuevo", async () => {
    if (!pool) return;
    let invoiceId: number | undefined;
    let reservationId: string | undefined;
    try {
      reservationId = await createReservation();
      const created = await issuePlainCashInvoice(reservationId, "efectivo");
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      invoiceId = Number(created.body.id);

      const oldCash = await pool.query("SELECT id FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1 AND anulado = false", [String(invoiceId)]);
      expect(oldCash.rows).toHaveLength(1);

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "transferencia" });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(edited.body.cashFormaPago ?? edited.body.cash_forma_pago).toBe("transferencia");

      const oldCashAfter = await pool.query("SELECT anulado, motivo_anulacion FROM cash_movements WHERE id = $1", [oldCash.rows[0].id]);
      expect(oldCashAfter.rows[0]).toMatchObject({ anulado: true, motivo_anulacion: "Edición de forma de pago" });

      const newCash = await pool.query("SELECT payment_method, amount FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1 AND anulado = false", [String(invoiceId)]);
      expect(newCash.rows).toEqual([{ payment_method: "transferencia", amount: "1000.00" }]);

      const invoiceRow = await pool.query("SELECT cash_forma_pago, cash_forma_pago_detalle FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(invoiceRow.rows[0].cash_forma_pago).toBe("transferencia");
      expect(invoiceRow.rows[0].cash_forma_pago_detalle).toEqual([{ method: "transferencia", amount: 1000 }]);
    } finally {
      await cleanupInvoice(invoiceId, reservationId);
    }
  });

  it("rechaza cambiar a Cuenta Corriente", async () => {
    if (!pool) return;
    let invoiceId: number | undefined;
    let reservationId: string | undefined;
    try {
      reservationId = await createReservation();
      const created = await issuePlainCashInvoice(reservationId, "efectivo");
      invoiceId = Number(created.body.id);

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "cuenta_corriente" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/Cuenta Corriente/);
    } finally {
      await cleanupInvoice(invoiceId, reservationId);
    }
  });

  it("rechaza editar una factura de reserva sin cobro real registrado (a Cuenta Corriente)", async () => {
    if (!pool) return;
    let invoiceId: number | undefined;
    let reservationId: string | undefined;
    try {
      reservationId = await createReservation();
      const guestId = `guest-cc-${randomUUID()}`;
      await pool.query("INSERT INTO guests (id, first_name, last_name, vat_condition) VALUES ($1, 'Prueba', 'CC', 'consumidor_final')", [guestId]);
      const created = await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FB",
        cliente: { razonSocial: "Cliente CC", condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Alojamiento en Hotel Maran", cantidad: 1, precioUnitario: 1000, alicuotaIva: "21", subtotalNeto: 826.45, subtotal: 1000, catalogItem: { source: "accommodation", id: "alojamiento" } }],
        reservaId: reservationId,
        cashFormaPago: "cuenta_corriente",
        cashFormaPagoDetalle: [{ method: "cuenta_corriente", amount: 1000 }],
        ccEntityType: "guest", ccEntityId: guestId,
        creditOperationId: randomUUID(),
        sourceChargeIds: ["accommodation"],
        sourceChargeAmounts: { accommodation: 1000 },
        folioContext: { billingTarget: "guest", hasAccommodation: true },
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      invoiceId = Number(created.body.id);

      const noCash = await pool.query("SELECT id FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
      expect(noCash.rows).toHaveLength(0);

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "efectivo" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/cobro real de Caja/);

      await pool.query("DELETE FROM guests WHERE id = $1", [guestId]);
    } finally {
      await cleanupInvoice(invoiceId, reservationId);
    }
  });

  it("rechaza editar una factura ARCA sin reserva ni Centro de Comprobantes (mantiene el bloqueo previo)", async () => {
    if (!pool) return;
    const { emitirFactura } = await import("../billing/invoiceService");
    let invoiceId: number | undefined;
    try {
      const invoice = await emitirFactura({
        tipoComprobante: "FB",
        cliente: { razonSocial: `Sin reserva ${randomUUID()}`, condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 1000, alicuotaIva: "21", subtotalNeto: 826.45, subtotal: 1000 }],
        cashFormaPago: "efectivo",
      });
      invoiceId = invoice.id;

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "transferencia" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/Centro de Comprobantes/);
    } finally {
      await cleanupInvoice(invoiceId, undefined);
    }
  });
});
