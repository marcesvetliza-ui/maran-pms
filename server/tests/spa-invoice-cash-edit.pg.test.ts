/**
 * Edición de la forma de pago de una factura de SPA — POST
 * /api/spa/accounts/:id/link-invoice crea, en una sola transacción, el
 * spa_payment, el cash_movement (area='spa', source_type='comprobante',
 * source_id=invoiceId — misma convención que Centro de Comprobantes y la
 * Reserva de sub-path (b), no source_id=accountId como Restaurant/Eventos)
 * y el pago del folio de la cuenta SPA (cash_movement_id poblado). Por eso
 * siempre hay exactamente un pago real, sin la ambigüedad de multi-split.
 *
 * El contraasiento del folio usa un monto NEGATIVO con voidedMovementId
 * (igual que voidReservationPaymentAtomic), no el patrón de monto positivo
 * del "void" de NC en billing/routes.ts. Este test verifica que el balance
 * del folio queda en 0 después de editar, y que spa_payments.method queda
 * en el vocabulario en inglés correcto (INVOICE_TO_SPA_PAYMENT_METHOD).
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

async function createSpaAccount(total: string): Promise<{ accountId: string; itemId: string }> {
  const suffix = randomUUID();
  const accountId = `pg-spa-cash-account-${suffix}`;
  const itemId = `pg-spa-cash-item-${suffix}`;
  await pool!.query(
    `INSERT INTO spa_accounts (id, appointment_id, guest_name, status, opened_at) VALUES ($1, $2, 'Huésped de prueba', 'open', NOW())`,
    [accountId, `appointment-${suffix}`],
  );
  await pool!.query(
    `INSERT INTO spa_account_items (id, account_id, description, quantity, unit_price, subtotal, item_type, created_at)
     VALUES ($1, $2, 'Tratamiento de prueba', 1, $3, $3, 'treatment', NOW())`,
    [itemId, accountId, total],
  );
  return { accountId, itemId };
}

async function emitAndLinkInvoice(accountId: string, total: number, method: string): Promise<number> {
  const { emitirFactura } = await import("../billing/invoiceService");
  const invoice = await emitirFactura({
    tipoComprobante: "FB",
    cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
    items: [{ descripcion: "Tratamiento de prueba", cantidad: 1, precioUnitario: total, alicuotaIva: "21", subtotalNeto: total / 1.21, subtotal: total }],
    spaAccountId: accountId,
    cashFormaPago: method,
  });
  const linked = await request("POST", `/api/spa/accounts/${accountId}/link-invoice`, { invoiceId: invoice.id });
  expect(linked.status, JSON.stringify(linked.body)).toBe(200);
  return Number(invoice.id);
}

async function cleanup(accountId: string | undefined, invoiceId: number | undefined) {
  if (accountId) {
    await pool!.query(`
      DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_type = 'spa_account' AND entity_id = $1)
    `, [accountId]);
    await pool!.query("DELETE FROM folios WHERE entity_type = 'spa_account' AND entity_id = $1", [accountId]);
    await pool!.query("DELETE FROM spa_payments WHERE account_id = $1", [accountId]);
    await pool!.query("DELETE FROM spa_account_items WHERE account_id = $1", [accountId]);
    await pool!.query("DELETE FROM spa_accounts WHERE id = $1", [accountId]);
  }
  if (invoiceId) {
    await pool!.query("DELETE FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
    await pool!.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
  }
}

suite("PostgreSQL real: edición de forma de pago de facturas de SPA", () => {
  beforeAll(async () => {
    const { registerSpaRoutes } = await import("../routes/spa");
    const { registerBillingRoutes } = await import("../billing/routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "spa-cash-edit-pg", username: "spa-cash-edit-pg", fullName: "Prueba Edición SPA", role: "admin" };
      req.isAuthenticated = () => true;
      next();
    });
    registerSpaRoutes(app);
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

  it("cambia el medio de pago real, traduce spa_payments.method y deja el folio en balance 0", async () => {
    if (!pool) return;
    let accountId: string | undefined;
    let invoiceId: number | undefined;
    try {
      ({ accountId } = await createSpaAccount("650.00"));
      invoiceId = await emitAndLinkInvoice(accountId, 650, "efectivo");

      const oldCash = await pool.query("SELECT id FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1 AND anulado = false", [String(invoiceId)]);
      expect(oldCash.rows).toHaveLength(1);

      const oldPayment = await pool.query("SELECT id, method FROM spa_payments WHERE account_id = $1 AND status = 'active'", [accountId]);
      expect(oldPayment.rows).toEqual([{ id: expect.any(String), method: "cash" }]);

      const folioBefore = await pool.query(`SELECT total_charges, total_payments, balance FROM folios WHERE entity_type = 'spa_account' AND entity_id = $1`, [accountId]);
      expect(folioBefore.rows[0]).toMatchObject({ total_charges: "650.00", total_payments: "650.00", balance: "0.00" });

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "transferencia" });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(edited.body.cashFormaPago ?? edited.body.cash_forma_pago).toBe("transferencia");

      const oldCashAfter = await pool.query("SELECT anulado, motivo_anulacion FROM cash_movements WHERE id = $1", [oldCash.rows[0].id]);
      expect(oldCashAfter.rows[0]).toMatchObject({ anulado: true, motivo_anulacion: "Edición de forma de pago" });

      const newCash = await pool.query("SELECT payment_method, amount FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1 AND anulado = false", [String(invoiceId)]);
      expect(newCash.rows).toEqual([{ payment_method: "transferencia", amount: "650.00" }]);

      const oldPaymentAfter = await pool.query("SELECT status, motivo_anulacion FROM spa_payments WHERE id = $1", [oldPayment.rows[0].id]);
      expect(oldPaymentAfter.rows[0]).toMatchObject({ status: "anulado", motivo_anulacion: "Edición de forma de pago" });

      // spa_payments.method usa vocabulario en inglés — "transfer", no "transferencia".
      const newPayment = await pool.query("SELECT method, amount, status FROM spa_payments WHERE account_id = $1 AND status = 'active'", [accountId]);
      expect(newPayment.rows).toEqual([{ method: "transfer", amount: "650.00", status: "active" }]);

      const folioAfter = await pool.query(`SELECT total_charges, total_payments, balance FROM folios WHERE entity_type = 'spa_account' AND entity_id = $1`, [accountId]);
      expect(folioAfter.rows[0]).toMatchObject({ total_charges: "650.00", total_payments: "650.00", balance: "0.00" });

      const invoiceRow = await pool.query("SELECT cash_forma_pago FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(invoiceRow.rows[0].cash_forma_pago).toBe("transferencia");
    } finally {
      await cleanup(accountId, invoiceId);
    }
  });

  it("rechaza cambiar a Cuenta Corriente", async () => {
    if (!pool) return;
    let accountId: string | undefined;
    let invoiceId: number | undefined;
    try {
      ({ accountId } = await createSpaAccount("300.00"));
      invoiceId = await emitAndLinkInvoice(accountId, 300, "efectivo");

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "cuenta_corriente" });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/Cuenta Corriente/);
    } finally {
      await cleanup(accountId, invoiceId);
    }
  });

  it("rechaza editar una factura ARCA sin reserva, pedido de Restaurante, cuenta de SPA ni Evento (mantiene el bloqueo previo)", async () => {
    if (!pool) return;
    const { emitirFactura } = await import("../billing/invoiceService");
    let invoiceId: number | undefined;
    try {
      const invoice = await emitirFactura({
        tipoComprobante: "FB",
        cliente: { razonSocial: `Sin spa ${randomUUID()}`, condicionIva: "Consumidor Final" },
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
