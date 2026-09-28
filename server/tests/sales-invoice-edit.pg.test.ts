/**
 * Edición post-emisión de un comprobante de Ventas — PATCH /api/billing/invoices/:id.
 *
 * Alcance acotado a propósito, después de investigar todos los circuitos que
 * generan sales_invoices (ver server/billing/centerSaleSettlement.ts,
 * editCenterSaleInvoicePaymentMethod): emitirFactura() nunca toca Caja/Cuenta
 * Corriente por sí sola — cada circuito de venta lo hace distinto, y solo el
 * Centro de Comprobantes usa cash_forma_pago_detalle como fuente real de esos
 * movimientos. Por eso:
 *  · ARCA + Centro de Comprobantes → se puede editar la forma de pago,
 *    revirtiendo y rehaciendo Caja/Cta Cte reales.
 *  · ARCA de otro circuito (sin center_settlement_area) → editar forma de
 *    pago queda bloqueado.
 *  · "Registrado" (cargado a mano) → forma de pago editable, informativa.
 *  · Voucher no fiscal → solo datos del cliente.
 *  · NC/ND → no se editan.
 */

import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
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

async function cleanupInvoice(invoiceId: number | undefined, guestId?: string) {
  if (invoiceId) {
    await pool!.query("DELETE FROM account_movements WHERE reference IN (SELECT tipo_comprobante || '-' || lpad(punto_venta::text,4,'0') || '-' || lpad(numero::text,8,'0') FROM sales_invoices WHERE id = $1)", [invoiceId]);
    await pool!.query("DELETE FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
    await pool!.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
  }
  if (guestId) await pool!.query("DELETE FROM guests WHERE id = $1", [guestId]);
}

suite("PostgreSQL real: edición post-emisión de comprobantes de Ventas", () => {
  beforeAll(async () => {
    const { registerBillingRoutes } = await import("../billing/routes");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "edit-invoice-pg", username: "edit-invoice-pg", fullName: "Prueba Edición", role: "admin" };
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

  it("Centro de Comprobantes: editar la forma de pago revierte Caja/Cta Cte viejos y crea los nuevos", async () => {
    if (!pool) return;
    const name = `Editar FP ${randomUUID()}`;
    const guest = await pool.query("INSERT INTO guests (first_name, last_name, vat_condition) VALUES ($1, 'Prueba', 'consumidor_final') RETURNING id", [name]);
    const guestId: string = guest.rows[0].id;
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/billing/invoices", {
        tipoComprobante: "FB", recipientMode: "centro_comprobantes",
        recipientEntity: { type: "guest", id: guestId },
        cliente: { razonSocial: `${name} Prueba`, condicionIva: "Consumidor Final" },
        cashArea: "recepcion", cashFormaPago: "pago_dividido",
        cashFormaPagoDetalle: [{ method: "efectivo", amount: 300 }, { method: "cuenta_corriente", amount: 700 }],
        items: [{ descripcion: "Alojamiento en Hotel Maran", cantidad: 1, precioUnitario: 1000, alicuotaIva: "21", subtotalNeto: 826.45, subtotal: 1000, catalogItem: { source: "accommodation", id: "alojamiento" } }],
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      invoiceId = Number(created.body.id);
      const label = `FB-${String(created.body.puntoVenta ?? created.body.punto_venta).padStart(4, "0")}-${String(created.body.numero).padStart(8, "0")}`;

      const oldCash = await pool.query("SELECT id FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1 AND anulado = false", [String(invoiceId)]);
      expect(oldCash.rows).toHaveLength(1);
      const oldCargo = await pool.query("SELECT id, amount FROM account_movements WHERE reference = $1 AND type = 'cargo' AND voided = false", [label]);
      expect(oldCargo.rows).toEqual([{ id: expect.any(String), amount: "700.00" }]);

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, {
        cashFormaPagoDetalle: [{ method: "transferencia", amount: 1000 }],
      });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(edited.body.cashFormaPago ?? edited.body.cash_forma_pago).toBe("transferencia");

      // El movimiento viejo de Caja queda anulado, no borrado.
      const oldCashAfter = await pool.query("SELECT anulado, motivo_anulacion FROM cash_movements WHERE id = $1", [oldCash.rows[0].id]);
      expect(oldCashAfter.rows[0]).toMatchObject({ anulado: true, motivo_anulacion: "Edición de forma de pago" });

      // Se creó un movimiento nuevo con la forma de pago corregida.
      const newCash = await pool.query("SELECT payment_method, amount FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1 AND anulado = false", [String(invoiceId)]);
      expect(newCash.rows).toEqual([{ payment_method: "transferencia", amount: "1000.00" }]);

      // El cargo de Cta Cte viejo queda voided con su contraasiento, y no hay cargo vigente nuevo (ya no hay cuenta_corriente en el detalle).
      const oldCargoAfter = await pool.query("SELECT voided, reversal_movement_id FROM account_movements WHERE id = $1", [oldCargo.rows[0].id]);
      expect(oldCargoAfter.rows[0].voided).toBe(true);
      expect(oldCargoAfter.rows[0].reversal_movement_id).toBeTruthy();
      const reversal = await pool.query("SELECT type, amount, reversal_of_movement_id FROM account_movements WHERE id = $1", [oldCargoAfter.rows[0].reversal_movement_id]);
      expect(reversal.rows[0]).toMatchObject({ type: "ajuste", amount: "-700.00", reversal_of_movement_id: oldCargo.rows[0].id });
      const cargoVigente = await pool.query("SELECT id FROM account_movements WHERE reference = $1 AND type = 'cargo' AND voided = false", [label]);
      expect(cargoVigente.rows).toHaveLength(0);
    } finally {
      await cleanupInvoice(invoiceId, guestId);
    }
  });

  it("rechaza editar la forma de pago de una factura ARCA que no se cobró desde el Centro de Comprobantes", async () => {
    if (!pool) return;
    const { emitirFactura } = await import("../billing/invoiceService");
    const name = `Sin centro ${randomUUID()}`;
    let invoiceId: number | undefined;
    try {
      const invoice = await emitirFactura({
        tipoComprobante: "FB",
        cliente: { razonSocial: `${name} Prueba`, condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 1000, alicuotaIva: "21", subtotalNeto: 826.45, subtotal: 1000 }],
        cashFormaPago: "efectivo",
      });
      invoiceId = invoice.id;
      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPagoDetalle: [{ method: "transferencia", amount: 1000 }] });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/Centro de Comprobantes/);
    } finally {
      await cleanupInvoice(invoiceId);
    }
  });

  it("rechaza editar una Nota de Crédito/Débito", async () => {
    if (!pool) return;
    const { emitirFactura } = await import("../billing/invoiceService");
    const name = `NC ${randomUUID()}`;
    let invoiceId: number | undefined;
    try {
      const invoice = await emitirFactura({
        tipoComprobante: "NCB",
        cliente: { razonSocial: `${name} Prueba`, condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Ajuste", cantidad: 1, precioUnitario: 500, alicuotaIva: "21", subtotalNeto: 413.22, subtotal: 500 }],
        facturaOriginalId: 1,
      });
      invoiceId = invoice.id;
      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPagoDetalle: [{ method: "efectivo", amount: 500 }] });
      expect(edited.status).toBe(403);
      expect(edited.body.error).toMatch(/Notas de Crédito/);
    } finally {
      await cleanupInvoice(invoiceId);
    }
  });

  it("comprobante registrado: la forma de pago se edita sin generar movimientos reales", async () => {
    if (!pool) return;
    const manual = await pool.query("SELECT numero FROM pos_configs WHERE tipo = 'manual' AND activo = true LIMIT 1");
    const manualPvNumero = manual.rows[0].numero;
    const numero = String(Math.floor(Math.random() * 900000) + 100000);
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/billing/invoices/registrar", {
        tipoComprobante: "FB", puntoVenta: manualPvNumero, numero, fechaEmision: "2026-09-25",
        cliente: { razonSocial: "Cliente Registrado Editar", condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 1000, subtotal: 1000, alicuotaIva: "21" }],
      });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      invoiceId = Number(created.body.id);

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cashFormaPago: "transferencia" });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(edited.body.cashFormaPago ?? edited.body.cash_forma_pago).toBe("transferencia");

      const movs = await pool.query("SELECT COUNT(*)::int AS count FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
      expect(movs.rows[0].count).toBe(0);
    } finally {
      await cleanupInvoice(invoiceId);
    }
  });

  it("comprobante registrado: no se pueden editar los datos del cliente desde acá", async () => {
    if (!pool) return;
    const manual = await pool.query("SELECT numero FROM pos_configs WHERE tipo = 'manual' AND activo = true LIMIT 1");
    const manualPvNumero = manual.rows[0].numero;
    const numero = String(Math.floor(Math.random() * 900000) + 100000);
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/billing/invoices/registrar", {
        tipoComprobante: "FB", puntoVenta: manualPvNumero, numero, fechaEmision: "2026-09-25",
        cliente: { razonSocial: "Cliente Registrado Sin Editar Datos", condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 1000, subtotal: 1000, alicuotaIva: "21" }],
      });
      invoiceId = Number(created.body.id);

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cliente: { razonSocial: "Otro nombre" } });
      // Sin cashFormaPago en el body, cae en el chequeo de "Falta la forma de pago".
      expect(edited.status).toBe(400);
    } finally {
      await cleanupInvoice(invoiceId);
    }
  });

  it("voucher no fiscal: se pueden editar los datos del cliente", async () => {
    if (!pool) return;
    const { emitirFactura } = await import("../billing/invoiceService");
    const name = `Ticket ${randomUUID()}`;
    let invoiceId: number | undefined;
    try {
      const invoice = await emitirFactura({
        tipoComprobante: "ticket",
        cliente: { razonSocial: name, condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Consumo", cantidad: 1, precioUnitario: 500, alicuotaIva: "21", subtotalNeto: 413.22, subtotal: 500 }],
      });
      invoiceId = invoice.id;

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, {
        cliente: { razonSocial: "Cliente Corregido SA", cuit: "30-11111111-1", condicionIva: "Responsable Inscripto" },
      });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      const persisted = await pool.query("SELECT cliente_razon_social, cliente_cuit, cliente_condicion_iva FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(persisted.rows[0]).toMatchObject({
        cliente_razon_social: "Cliente Corregido SA", cliente_cuit: "30-11111111-1", cliente_condicion_iva: "Responsable Inscripto",
      });
    } finally {
      await cleanupInvoice(invoiceId);
    }
  });

  it("voucher no fiscal: no se puede editar la forma de pago desde acá (queda ignorada, solo cliente)", async () => {
    if (!pool) return;
    const { emitirFactura } = await import("../billing/invoiceService");
    const name = `Ticket sin FP ${randomUUID()}`;
    let invoiceId: number | undefined;
    try {
      const invoice = await emitirFactura({
        tipoComprobante: "ticket",
        cliente: { razonSocial: name, condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Consumo", cantidad: 1, precioUnitario: 500, alicuotaIva: "21", subtotalNeto: 413.22, subtotal: 500 }],
      });
      invoiceId = invoice.id;

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cliente: {} });
      expect(edited.status).toBe(400);
      expect(edited.body.error).toMatch(/razón social/i);
    } finally {
      await cleanupInvoice(invoiceId);
    }
  });

  it("rechaza editar un comprobante anulado", async () => {
    if (!pool) return;
    const { emitirFactura } = await import("../billing/invoiceService");
    const name = `Anulado ${randomUUID()}`;
    let invoiceId: number | undefined;
    try {
      const invoice = await emitirFactura({
        tipoComprobante: "ticket",
        cliente: { razonSocial: name, condicionIva: "Consumidor Final" },
        items: [{ descripcion: "Consumo", cantidad: 1, precioUnitario: 500, alicuotaIva: "21", subtotalNeto: 413.22, subtotal: 500 }],
      });
      invoiceId = invoice.id;
      await pool.query("UPDATE sales_invoices SET estado = 'anulada' WHERE id = $1", [invoiceId]);

      const edited = await request("PATCH", `/api/billing/invoices/${invoiceId}`, { cliente: { razonSocial: "Nuevo nombre" } });
      expect(edited.status).toBe(403);
    } finally {
      await cleanupInvoice(invoiceId);
    }
  });
});
