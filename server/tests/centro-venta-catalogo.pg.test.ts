import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../billing/billingConfig", async (importOriginal) => {
  const original = await importOriginal<typeof import("../billing/billingConfig")>();
  return { ...original, getBillingConfig: async () => ({ ...(await original.getBillingConfig()), arcaAmbiente: "ficticio" }) };
});

const runWithPg = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }) : null;
let server: Server;
let url: string;

runWithPg("Centro de Comprobantes: revisión y emisión con PostgreSQL", () => {
  beforeAll(async () => {
    const { registerBillingRoutes } = await import("../billing/routes");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: "centro-catalogo-pg", username: "centro-catalogo-pg", fullName: "Prueba Centro", role: "admin" } as any;
      req.isAuthenticated = () => true;
      next();
    });
    registerBillingRoutes(app);
    server = await new Promise<Server>(resolve => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor de prueba no disponible");
    url = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool?.end();
  });

  it("rechaza una descripción suelta y emite el alojamiento elegido del catálogo", async () => {
    const name = `Catalogo ${randomUUID()}`;
    const guest = await pool!.query("INSERT INTO guests (first_name, last_name, vat_condition) VALUES ($1, 'Prueba', 'consumidor_final') RETURNING id", [name]);
    const guestId: string = guest.rows[0].id;
    let invoiceId: number | undefined;
    const body = {
      tipoComprobante: "FB", recipientMode: "centro_comprobantes",
      recipientEntity: { type: "guest", id: guestId },
      cliente: { razonSocial: `${name} Prueba`, condicionIva: "Consumidor Final" },
      cashArea: "recepcion", cashFormaPago: "efectivo", cashFormaPagoDetalle: [{ method: "efectivo", amount: 1000 }],
      items: [{ descripcion: "Alojamiento en Hotel Maran", cantidad: 1, precioUnitario: 1000, alicuotaIva: "21", subtotalNeto: 826.45, subtotal: 1000 }],
    };
    const post = async (payload: unknown) => {
      const response = await fetch(`${url}/api/billing/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const rejected = await post(body);
      expect(rejected.status).toBe(400);
      expect(rejected.body.error).toMatch(/catálogo/);

      const emitted = await post({ ...body, items: [{ ...body.items[0], catalogItem: { source: "accommodation", id: "alojamiento" } }] });
      expect(emitted.status).toBe(201);
      invoiceId = emitted.body.id ?? emitted.body.invoice?.id;
      expect(invoiceId).toBeTruthy();
      const saved = await pool!.query("SELECT recipient_entity_id, items FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(saved.rows[0]?.recipient_entity_id).toBe(guestId);
      expect(saved.rows[0]?.items[0]?.catalogItem).toEqual({ source: "accommodation", id: "alojamiento" });
    } finally {
      if (invoiceId) await pool!.query("DELETE FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
      if (invoiceId) await pool!.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      await pool!.query("DELETE FROM guests WHERE id = $1", [guestId]);
    }
  });

  it("divide Caja y Cuenta Corriente, conserva importes y reintenta sin duplicar", async () => {
    const name = `Cobro dividido ${randomUUID()}`;
    const guest = await pool!.query("INSERT INTO guests (first_name, last_name, vat_condition) VALUES ($1, 'Prueba', 'consumidor_final') RETURNING id", [name]);
    const guestId: string = guest.rows[0].id;
    let invoiceId: number | undefined;
    try {
      const requestBody = {
          tipoComprobante: "FB", recipientMode: "centro_comprobantes",
          recipientEntity: { type: "guest", id: guestId },
          cliente: { razonSocial: `${name} Prueba`, condicionIva: "Consumidor Final" },
          cashArea: "recepcion", cashFormaPago: "pago_dividido",
          cashFormaPagoDetalle: [
            { method: "efectivo", amount: 300 }, { method: "transferencia", amount: 200 },
            { method: "cuenta_corriente", amount: 500 },
          ],
          items: [{ descripcion: "Alojamiento en Hotel Maran", cantidad: 1, precioUnitario: 1000, alicuotaIva: "21", subtotalNeto: 826.45, subtotal: 1000, catalogItem: { source: "accommodation", id: "alojamiento" } }],
        };
      const invalid = await fetch(`${url}/api/billing/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...requestBody, cashFormaPagoDetalle: [{ method: "efectivo", amount: 900 }] }) });
      expect(invalid.status).toBe(400);
      const response = await fetch(`${url}/api/billing/invoices`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const emitted = await response.json();
      expect(response.status).toBe(201);
      expect(emitted.cashMovementError).toBeUndefined();
      invoiceId = Number(emitted.id);
      const cash = await pool!.query("SELECT payment_method, amount FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1 ORDER BY payment_method", [String(invoiceId)]);
      expect(cash.rows).toEqual([
        { payment_method: "efectivo", amount: "300.00" }, { payment_method: "transferencia", amount: "200.00" },
      ]);
      const invoice = await pool!.query("SELECT center_settlement_status, cash_forma_pago_detalle FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(invoice.rows[0].center_settlement_status).toBe("settled");
      expect(invoice.rows[0].cash_forma_pago_detalle).toHaveLength(3);
      const debt = await pool!.query("SELECT amount, entity_id FROM account_movements WHERE reference = $1 AND entity_id = $2 AND type = 'cargo'", [
        `FB-${String(emitted.puntoVenta ?? emitted.punto_venta).padStart(4, "0")}-${String(emitted.numero).padStart(8, "0")}`, guestId,
      ]);
      expect(debt.rows).toEqual([{ amount: "500.00", entity_id: guestId }]);

      const retry = await fetch(`${url}/api/billing/invoices/${invoiceId}/settle-center`, { method: "POST" });
      expect(retry.status).toBe(200);
      const after = await pool!.query("SELECT COUNT(*)::int AS count FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
      expect(after.rows[0].count).toBe(2);
    } finally {
      if (invoiceId) {
        const invoice = await pool!.query("SELECT tipo_comprobante, punto_venta, numero FROM sales_invoices WHERE id = $1", [invoiceId]);
        if (invoice.rows[0]) await pool!.query("DELETE FROM account_movements WHERE entity_id = $1 AND reference = $2", [guestId, `${invoice.rows[0].tipo_comprobante}-${String(invoice.rows[0].punto_venta).padStart(4, "0")}-${String(invoice.rows[0].numero).padStart(8, "0")}`]);
        await pool!.query("DELETE FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
        await pool!.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      }
      await pool!.query("DELETE FROM guests WHERE id = $1", [guestId]);
    }
  });

  it("revierte todos los movimientos si falla la Cuenta Corriente y permite reintentar", async () => {
    const [{ emitirFactura }, { settleCenterSaleInvoice }] = await Promise.all([
      import("../billing/invoiceService"), import("../billing/centerSaleSettlement"),
    ]);
    const name = `Fallo cobro ${randomUUID()}`;
    const guest = await pool!.query("INSERT INTO guests (first_name, last_name, vat_condition) VALUES ($1, 'Prueba', 'consumidor_final') RETURNING id", [name]);
    const guestId: string = guest.rows[0].id;
    let invoiceId: number | undefined;
    try {
      const invoice = await emitirFactura({
        tipoComprobante: "FB", cliente: { razonSocial: `${name} Prueba`, condicionIva: "Consumidor Final" },
        recipientEntity: { type: "guest", id: guestId }, centerSettlementArea: "recepcion",
        cashFormaPago: "pago_dividido", cashFormaPagoDetalle: [{ method: "efectivo", amount: 600 }, { method: "cuenta_corriente", amount: 400 }],
        items: [{ descripcion: "Alojamiento en Hotel Maran", cantidad: 1, precioUnitario: 1000, alicuotaIva: "21", subtotalNeto: 826.45, subtotal: 1000 }],
      });
      invoiceId = invoice.id;
      await expect(settleCenterSaleInvoice(invoiceId, "test", async () => { throw new Error("Fallo simulado en cargo CC"); }))
        .rejects.toThrow("Fallo simulado");
      const cash = await pool!.query("SELECT COUNT(*)::int AS count FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
      expect(cash.rows[0].count).toBe(0);
      const pending = await pool!.query("SELECT center_settlement_status FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(pending.rows[0].center_settlement_status).toBe("pending");
      await settleCenterSaleInvoice(invoiceId, "test");
      const settled = await pool!.query("SELECT center_settlement_status FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(settled.rows[0].center_settlement_status).toBe("settled");
    } finally {
      if (invoiceId) {
        const invoice = await pool!.query("SELECT tipo_comprobante, punto_venta, numero FROM sales_invoices WHERE id = $1", [invoiceId]);
        if (invoice.rows[0]) await pool!.query("DELETE FROM account_movements WHERE entity_id = $1 AND reference = $2", [guestId, `${invoice.rows[0].tipo_comprobante}-${String(invoice.rows[0].punto_venta).padStart(4, "0")}-${String(invoice.rows[0].numero).padStart(8, "0")}`]);
        await pool!.query("DELETE FROM cash_movements WHERE source_type = 'comprobante' AND source_id = $1", [String(invoiceId)]);
        await pool!.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
      }
      await pool!.query("DELETE FROM guests WHERE id = $1", [guestId]);
    }
  });
});
