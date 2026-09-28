/**
 * Edición de la forma de pago de una factura de Restaurante (pedido cerrado
 * con un único medio real de Caja) — POST /api/restaurant/orders/:id/close
 * escribe un cash_movement (source_type='restaurant_order') y un pago de
 * folio (entity_type='restaurant_order', payment sourceType=
 * 'restaurant_payment'); PATCH /api/billing/invoices/:id debe revertir y
 * rehacer ambos sin duplicar el saldo del folio.
 *
 * El contraasiento del folio usa un monto NEGATIVO con voidedMovementId
 * (igual que voidReservationPaymentAtomic en server/db-storage.ts), no el
 * patrón de monto positivo que usa el "void" de NC en billing/routes.ts —
 * ese bucket suma en vez de cancelar. Este test verifica que el balance del
 * folio queda en 0 después de editar, no en un negativo doble.
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

// El cierre de pedido escribe el pago del folio en un .then() sin esperarlo
// (fire-and-forget, server/routes/restaurant.ts) — hay que sondear en vez de
// asumir que ya está escrito apenas responde el POST /close.
async function waitForFolioPayment(orderId: string, expectedTotal?: number) {
  for (let i = 0; i < 20; i++) {
    const row = await pool!.query(`
      SELECT total_payments FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1
    `, [orderId]);
    const paid = parseFloat(row.rows[0]?.total_payments ?? "0");
    if (expectedTotal === undefined ? paid > 0 : paid >= expectedTotal - 0.01) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Folio del pedido ${orderId} nunca reflejó el pago (fire-and-forget no completó a tiempo)`);
}

async function createOpenOrder(total: string): Promise<string> {
  const orderId = randomUUID();
  await pool!.query(
    `INSERT INTO restaurant_orders (id, order_number, order_type, status, total, opened_at)
     VALUES ($1, $2, 'dine_in', 'open', $3, NOW())`,
    [orderId, `ORD-TEST-${orderId.slice(-8)}`, total],
  );
  return orderId;
}

async function cleanup(orderId: string | undefined, invoiceId: number | undefined) {
  if (invoiceId) {
    await pool!.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
  }
  if (orderId) {
    await pool!.query("DELETE FROM cash_movements WHERE source_type = 'restaurant_order' AND source_id = $1", [orderId]);
    await pool!.query(`
      DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1)
    `, [orderId]);
    await pool!.query("DELETE FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1", [orderId]);
    await pool!.query("DELETE FROM restaurant_orders WHERE id = $1", [orderId]);
  }
}

suite("PostgreSQL real: edición de forma de pago de facturas de Restaurante", () => {
  beforeAll(async () => {
    const { registerRestaurantRoutes } = await import("../routes/restaurant");
    const { registerBillingRoutes } = await import("../billing/routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "restaurant-cash-edit-pg", username: "restaurant-cash-edit-pg", fullName: "Prueba Edición Restaurant", role: "admin" };
      req.isAuthenticated = () => true;
      next();
    });
    registerRestaurantRoutes(app);
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

  it("cambia el medio de pago real y deja el folio del pedido en balance 0", async () => {
    if (!pool) return;
    let orderId: string | undefined;
    let invoiceId: number | undefined;
    try {
      orderId = await createOpenOrder("500.00");
      const closed = await request("POST", `/api/restaurant/orders/${orderId}/close`, {
        paymentMethod: "efectivo",
        receiptType: "factura_b",
        emitInvoice: true,
      });
      expect(closed.status, JSON.stringify(closed.body)).toBe(200);
      invoiceId = Number(closed.body.invoiceId);
      expect(invoiceId).toBeGreaterThan(0);

      const oldCash = await pool.query("SELECT id FROM cash_movements WHERE source_type = 'restaurant_order' AND source_id = $1 AND anulado = false", [orderId]);
      expect(oldCash.rows).toHaveLength(1);

      await waitForFolioPayment(orderId);
      const folioBefore = await pool.query(`
        SELECT total_charges, total_payments, balance FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1
      `, [orderId]);
      expect(folioBefore.rows[0]).toMatchObject({ total_charges: "500.00", total_payments: "500.00", balance: "0.00" });

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "transferencia" });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(edited.body.cashFormaPago ?? edited.body.cash_forma_pago).toBe("transferencia");

      const oldCashAfter = await pool.query("SELECT anulado, motivo_anulacion FROM cash_movements WHERE id = $1", [oldCash.rows[0].id]);
      expect(oldCashAfter.rows[0]).toMatchObject({ anulado: true, motivo_anulacion: "Edición de forma de pago" });

      const newCash = await pool.query("SELECT payment_method, amount FROM cash_movements WHERE source_type = 'restaurant_order' AND source_id = $1 AND anulado = false", [orderId]);
      expect(newCash.rows).toEqual([{ payment_method: "transferencia", amount: "500.00" }]);

      // El folio no debe duplicar ni perder el pago: sigue en balance 0.
      const folioAfter = await pool.query(`
        SELECT total_charges, total_payments, balance FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1
      `, [orderId]);
      expect(folioAfter.rows[0]).toMatchObject({ total_charges: "500.00", total_payments: "500.00", balance: "0.00" });

      const orderRow = await pool.query("SELECT payment_method FROM restaurant_orders WHERE id = $1", [orderId]);
      expect(orderRow.rows[0].payment_method).toBe("transferencia");

      const invoiceRow = await pool.query("SELECT cash_forma_pago FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(invoiceRow.rows[0].cash_forma_pago).toBe("transferencia");
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it("rechaza cambiar a Cuenta Corriente", async () => {
    if (!pool) return;
    let orderId: string | undefined;
    let invoiceId: number | undefined;
    try {
      orderId = await createOpenOrder("300.00");
      const closed = await request("POST", `/api/restaurant/orders/${orderId}/close`, {
        paymentMethod: "efectivo", receiptType: "factura_b", emitInvoice: true,
      });
      invoiceId = Number(closed.body.invoiceId);

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "cuenta_corriente" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/Cuenta Corriente/);
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it("rechaza editar un pedido cobrado con múltiples formas de pago (pago dividido)", async () => {
    if (!pool) return;
    let orderId: string | undefined;
    let invoiceId: number | undefined;
    try {
      orderId = await createOpenOrder("400.00");
      const closed = await request("POST", `/api/restaurant/orders/${orderId}/close`, {
        receiptType: "factura_b", emitInvoice: true,
        paymentSplits: [{ method: "efectivo", amount: 200 }, { method: "transferencia", amount: 200 }],
      });
      invoiceId = Number(closed.body.invoiceId);

      const splits = await pool.query("SELECT id FROM cash_movements WHERE source_type = 'restaurant_order' AND source_id = $1 AND anulado = false", [orderId]);
      expect(splits.rows).toHaveLength(2);

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "efectivo" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/más de una forma de pago/);

      // Antes de limpiar: los dos .then() fire-and-forget del cierre
      // (un addFolioCharge + addFolioPayment por split) pueden seguir en
      // vuelo y truenan al insertar contra un folio que cleanup() ya borró.
      await waitForFolioPayment(orderId, 400).catch(() => undefined);
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it("rechaza editar una factura ARCA sin reserva ni pedido de Restaurante (mantiene el bloqueo previo)", async () => {
    if (!pool) return;
    const { emitirFactura } = await import("../billing/invoiceService");
    let invoiceId: number | undefined;
    try {
      const invoice = await emitirFactura({
        tipoComprobante: "FB",
        cliente: { razonSocial: `Sin restaurante ${randomUUID()}`, condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 500, alicuotaIva: "21", subtotalNeto: 413.22, subtotal: 500 }],
        cashFormaPago: "efectivo",
      });
      invoiceId = invoice.id;

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "transferencia" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/Centro de Comprobantes/);
    } finally {
      await cleanup(undefined, invoiceId);
    }
  });
});
