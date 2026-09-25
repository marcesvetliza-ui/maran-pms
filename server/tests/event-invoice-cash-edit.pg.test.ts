/**
 * Edición de la forma de pago de una factura de Evento (un único pago activo,
 * cobrado con un medio real de Caja). A diferencia de Recepción/Restaurant,
 * el pago de un evento se registra ANTES de facturar — POST
 * /api/events/:eventId/close solo emite el comprobante sobre los pagos ya
 * existentes, sin crear cash_movements ni folio_movements nuevos. El vínculo
 * factura↔evento también es al revés: events.invoice_id, no una columna en
 * sales_invoices.
 *
 * El contraasiento del folio usa un monto NEGATIVO con voidedMovementId
 * (igual que voidReservationPaymentAtomic y la anulación de pago de evento
 * ya existente en events.ts), no el patrón de monto positivo del "void" de
 * NC en billing/routes.ts. Este test verifica que el balance del folio
 * queda en 0 después de editar.
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

// Las cargas de cargo/pago al folio del evento se escriben en un .then()/
// .catch() sin esperarlas (fire-and-forget, server/routes/events.ts) — hay
// que sondear en vez de asumir que ya están escritas apenas responde el POST.
async function waitForFolioTotals(eventId: string, expectedCharges: number, expectedPayments: number) {
  for (let i = 0; i < 20; i++) {
    const row = await pool!.query(`SELECT total_charges, total_payments FROM folios WHERE entity_type = 'event' AND entity_id = $1`, [eventId]);
    const r = row.rows[0];
    if (r && parseFloat(r.total_charges) === expectedCharges && parseFloat(r.total_payments) === expectedPayments) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Folio del evento ${eventId} nunca reflejó cargo=${expectedCharges}/pago=${expectedPayments} (fire-and-forget no completó a tiempo)`);
}

async function createEvent(): Promise<{ eventId: string; eventRoomId: string }> {
  const suffix = randomUUID();
  const eventRoomId = `pg-event-cash-room-${suffix}`;
  const eventId = `pg-event-cash-event-${suffix}`;
  await pool!.query(
    `INSERT INTO event_rooms (id, name, capacity, status) VALUES ($1, 'Salón de prueba', 50, 'available')`,
    [eventRoomId],
  );
  await pool!.query(
    `INSERT INTO events (id, event_code, name, event_room_id, event_type, contact_name, start_date, end_date, status, created_at)
     VALUES ($1, $2, 'Evento cobrado en Caja', $3, 'corporate', 'Contacto de prueba', DATE '2026-08-26', DATE '2026-08-26', 'confirmed', NOW())`,
    [eventId, `PGEVCASH-${suffix}`, eventRoomId],
  );
  return { eventId, eventRoomId };
}

async function fundAndCloseEvent(eventId: string, amount: number, method: string): Promise<number> {
  const charged = await request("POST", `/api/events/${eventId}/charges`, { description: "Salón + catering", unitPrice: amount });
  expect(charged.status, JSON.stringify(charged.body)).toBe(201);
  const paid = await request("POST", `/api/events/${eventId}/payments`, { amount, method });
  expect(paid.status, JSON.stringify(paid.body)).toBe(201);
  await waitForFolioTotals(eventId, amount, amount);
  const closed = await request("POST", `/api/events/${eventId}/close`, { receiptType: "factura_b" });
  expect(closed.status, JSON.stringify(closed.body)).toBe(200);
  return Number(closed.body.invoiceId);
}

async function cleanup(eventId: string | undefined, eventRoomId: string | undefined, invoiceId: number | undefined) {
  if (invoiceId) await pool!.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
  if (eventId) {
    await pool!.query("DELETE FROM cash_movements WHERE source_type = 'event' AND source_id = $1", [eventId]);
    await pool!.query(`
      DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_type = 'event' AND entity_id = $1)
    `, [eventId]);
    await pool!.query("DELETE FROM folios WHERE entity_type = 'event' AND entity_id = $1", [eventId]);
    await pool!.query("DELETE FROM event_payments WHERE event_id = $1", [eventId]);
    await pool!.query("DELETE FROM event_charges WHERE event_id = $1", [eventId]);
    await pool!.query("DELETE FROM events WHERE id = $1", [eventId]);
  }
  if (eventRoomId) await pool!.query("DELETE FROM event_rooms WHERE id = $1", [eventRoomId]);
}

suite("PostgreSQL real: edición de forma de pago de facturas de Evento", () => {
  beforeAll(async () => {
    const { registerEventsRoutes } = await import("../routes/events");
    const { registerBillingRoutes } = await import("../billing/routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "event-cash-edit-pg", username: "event-cash-edit-pg", fullName: "Prueba Edición Evento", role: "admin" };
      req.isAuthenticated = () => true;
      next();
    });
    registerEventsRoutes(app);
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

  it("cambia el medio de pago real y deja el folio del evento en balance 0", async () => {
    if (!pool) return;
    let eventId: string | undefined;
    let eventRoomId: string | undefined;
    let invoiceId: number | undefined;
    try {
      ({ eventId, eventRoomId } = await createEvent());
      invoiceId = await fundAndCloseEvent(eventId, 800, "efectivo");

      const oldCash = await pool.query("SELECT id FROM cash_movements WHERE source_type = 'event' AND source_id = $1 AND anulado = false", [eventId]);
      expect(oldCash.rows).toHaveLength(1);

      const oldPayment = await pool.query("SELECT id FROM event_payments WHERE event_id = $1 AND status = 'active'", [eventId]);
      expect(oldPayment.rows).toHaveLength(1);

      const folioBefore = await pool.query(`SELECT total_charges, total_payments, balance FROM folios WHERE entity_type = 'event' AND entity_id = $1`, [eventId]);
      expect(folioBefore.rows[0]).toMatchObject({ total_charges: "800.00", total_payments: "800.00", balance: "0.00" });

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "transferencia" });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(edited.body.cashFormaPago ?? edited.body.cash_forma_pago).toBe("transferencia");

      const oldCashAfter = await pool.query("SELECT anulado, motivo_anulacion FROM cash_movements WHERE id = $1", [oldCash.rows[0].id]);
      expect(oldCashAfter.rows[0]).toMatchObject({ anulado: true, motivo_anulacion: "Edición de forma de pago" });

      const newCash = await pool.query("SELECT payment_method, amount FROM cash_movements WHERE source_type = 'event' AND source_id = $1 AND anulado = false", [eventId]);
      expect(newCash.rows).toEqual([{ payment_method: "transferencia", amount: "800.00" }]);

      const oldPaymentAfter = await pool.query("SELECT status, motivo_anulacion FROM event_payments WHERE id = $1", [oldPayment.rows[0].id]);
      expect(oldPaymentAfter.rows[0]).toMatchObject({ status: "anulado", motivo_anulacion: "Edición de forma de pago" });

      const newPayment = await pool.query("SELECT method, amount, status FROM event_payments WHERE event_id = $1 AND status = 'active'", [eventId]);
      expect(newPayment.rows).toEqual([{ method: "transferencia", amount: "800.00", status: "active" }]);

      const folioAfter = await pool.query(`SELECT total_charges, total_payments, balance FROM folios WHERE entity_type = 'event' AND entity_id = $1`, [eventId]);
      expect(folioAfter.rows[0]).toMatchObject({ total_charges: "800.00", total_payments: "800.00", balance: "0.00" });

      const invoiceRow = await pool.query("SELECT cash_forma_pago FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(invoiceRow.rows[0].cash_forma_pago).toBe("transferencia");
    } finally {
      await cleanup(eventId, eventRoomId, invoiceId);
    }
  });

  it("el GET de la factura expone el medio real de pago del evento para precargar el editor", async () => {
    if (!pool) return;
    let eventId: string | undefined;
    let eventRoomId: string | undefined;
    let invoiceId: number | undefined;
    try {
      ({ eventId, eventRoomId } = await createEvent());
      invoiceId = await fundAndCloseEvent(eventId, 500, "tarjeta_credito");

      const fetched = await request("GET", `/api/billing/invoices/${invoiceId}`);
      expect(fetched.status).toBe(200);
      expect(fetched.body.event_id).toBe(eventId);
      expect(fetched.body.event_payment_method).toBe("tarjeta_credito");
      // cash_forma_pago nunca se seteó al emitir — el evento se cobra antes de facturar.
      expect(fetched.body.cash_forma_pago).toBeNull();
    } finally {
      await cleanup(eventId, eventRoomId, invoiceId);
    }
  });

  it("rechaza cambiar a Cuenta Corriente", async () => {
    if (!pool) return;
    let eventId: string | undefined;
    let eventRoomId: string | undefined;
    let invoiceId: number | undefined;
    try {
      ({ eventId, eventRoomId } = await createEvent());
      invoiceId = await fundAndCloseEvent(eventId, 300, "efectivo");

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "cuenta_corriente" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/Cuenta Corriente/);
    } finally {
      await cleanup(eventId, eventRoomId, invoiceId);
    }
  });

  it("rechaza editar un evento con más de un pago activo", async () => {
    if (!pool) return;
    let eventId: string | undefined;
    let eventRoomId: string | undefined;
    let invoiceId: number | undefined;
    try {
      ({ eventId, eventRoomId } = await createEvent());
      await request("POST", `/api/events/${eventId}/charges`, { description: "Salón + catering", unitPrice: 600 });
      await request("POST", `/api/events/${eventId}/payments`, { amount: 300, method: "efectivo" });
      await request("POST", `/api/events/${eventId}/payments`, { amount: 300, method: "transferencia" });
      const closed = await request("POST", `/api/events/${eventId}/close`, { receiptType: "factura_b" });
      invoiceId = Number(closed.body.invoiceId);

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "efectivo" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/más de un pago/);
    } finally {
      await cleanup(eventId, eventRoomId, invoiceId);
    }
  });

  it("rechaza editar una factura ARCA sin reserva, pedido de Restaurante ni Evento (mantiene el bloqueo previo)", async () => {
    if (!pool) return;
    const { emitirFactura } = await import("../billing/invoiceService");
    let invoiceId: number | undefined;
    try {
      const invoice = await emitirFactura({
        tipoComprobante: "FB",
        cliente: { razonSocial: `Sin evento ${randomUUID()}`, condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 500, alicuotaIva: "21", subtotalNeto: 413.22, subtotal: 500 }],
        cashFormaPago: "efectivo",
      });
      invoiceId = invoice.id;

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "transferencia" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/Centro de Comprobantes/);
    } finally {
      await cleanup(undefined, undefined, invoiceId);
    }
  });
});
