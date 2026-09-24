import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (_roles: string[]) => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

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
  return { status: response.status, body: await response.json() as any };
}

suite("PostgreSQL real: factura de compra y stock atómicos", () => {
  beforeAll(async () => {
    const { registerRoutes } = await import("../routes");
    const app = express();
    app.use(express.json());
    server = http.createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
  });

  it("carga una factura como deuda aunque un cliente antiguo envíe contado, y la cancela recién con una OP", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplier = await pool.query<{ id: number }>(
      "INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva) VALUES ($1, $2, 'responsable_inscripto') RETURNING id",
      [`Proveedor pago ${suffix}`, `30${suffix.replaceAll("-", "").slice(0, 9)}`],
    );
    const supplierId = supplier.rows[0].id;
    let invoiceId: number | undefined;
    let invoiceEntryId: number | undefined;
    let opId: number | undefined;
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "FACT-A", supplierId,
        numeroComprobante: `PAGO-${suffix}`, fechaEmision: "2026-09-23",
        condicionPago: "contado", montoNeto: "100.00",
      });
      expect(created.status).toBe(201);
      invoiceId = Number(created.body.id);
      invoiceEntryId = Number(created.body.asiento_id);
      expect(created.body).toMatchObject({ condicion_pago: "cuenta_corriente", estado: "pendiente" });
      const lines = await pool.query<{ codigo: string; haber: string }>(
        `SELECT aa.codigo, ael.haber FROM accounting_entry_lines ael
         JOIN accounting_accounts aa ON aa.id = ael.account_id
         WHERE ael.entry_id = $1`, [invoiceEntryId],
      );
      expect(lines.rows).toEqual(expect.arrayContaining([{ codigo: "2.1.1.01", haber: "100.00" }]));
      expect(lines.rows.some((line) => line.codigo === "1.1.1.01" && Number(line.haber) > 0)).toBe(false);
      expect((await pool.query("SELECT id FROM payment_order_items WHERE invoice_id = $1", [invoiceId])).rowCount).toBe(0);

      const op = await request("POST", "/api/payment-orders", {
        supplierId, facturaIds: [invoiceId], fecha: "2026-09-23", formaPago: "transferencia",
      });
      expect(op.status).toBe(201);
      opId = Number(op.body.id);
      expect((await pool.query("SELECT estado FROM purchase_invoices WHERE id = $1", [invoiceId])).rows[0].estado).toBe("pagado");
      expect((await pool.query("SELECT importe_cancelado FROM payment_order_items WHERE invoice_id = $1", [invoiceId])).rows[0].importe_cancelado).toBe("100.00");
    } finally {
      if (opId) {
        const opEntry = await pool.query<{ asiento_id: number | null }>("SELECT asiento_id FROM payment_orders WHERE id = $1", [opId]);
        await pool.query("DELETE FROM payment_order_items WHERE payment_order_id = $1", [opId]);
        await pool.query("DELETE FROM payment_orders WHERE id = $1", [opId]);
        if (opEntry.rows[0]?.asiento_id) {
          await pool.query("DELETE FROM accounting_entry_lines WHERE entry_id = $1", [opEntry.rows[0].asiento_id]);
          await pool.query("DELETE FROM accounting_entries WHERE id = $1", [opEntry.rows[0].asiento_id]);
        }
      }
      if (invoiceEntryId) {
        await pool.query("DELETE FROM accounting_entry_lines WHERE entry_id = $1", [invoiceEntryId]);
        await pool.query("DELETE FROM accounting_entries WHERE id = $1", [invoiceEntryId]);
      }
      if (invoiceId) await pool.query("DELETE FROM purchase_invoices WHERE id = $1", [invoiceId]);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });

  it("revierte factura, asiento y primera entrada si falla el segundo artículo", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplier = await pool.query<{ id: number }>(
      `INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva)
       VALUES ($1, $2, 'responsable_inscripto') RETURNING id`,
      [`Proveedor stock ${suffix}`, `30${suffix.replaceAll("-", "").slice(0, 9)}`],
    );
    const item = await pool.query<{ id: string }>(
      "INSERT INTO inventory_items (name, unit, current_stock, cost_price) VALUES ($1, 'unidad', 3, 9) RETURNING id",
      [`Artículo ${suffix}`],
    );
    const itemId = item.rows[0].id;
    const supplierId = supplier.rows[0].id;
    const numero = `STOCK-${suffix}`;
    const payload = {
      tipoComprobante: "FACT-A", supplierId, numeroComprobante: numero,
      fechaEmision: "2026-09-23", periodo: "09/2026", condicionPago: "cuenta_corriente",
      montoNeto: "100", stockItems: [
        { itemId, quantity: "2", unitCost: "15", vatRate: "21", warehouseId: null },
        { itemId: randomUUID(), quantity: "1", unitCost: "12", warehouseId: null },
      ],
    };
    try {
      const rejected = await request("POST", "/api/purchase-invoices", payload);
      expect(rejected.status).toBe(400);
      expect(String(rejected.body.error)).toMatch(/Artículo 2/);
      expect((await pool.query("SELECT id FROM purchase_invoices WHERE numero_comprobante = $1", [numero])).rowCount).toBe(0);
      expect((await pool.query("SELECT id FROM purchase_invoice_lines WHERE item_id = $1", [itemId])).rowCount).toBe(0);
      expect((await pool.query("SELECT id FROM stock_movements WHERE item_id = $1", [itemId])).rowCount).toBe(0);
      expect((await pool.query("SELECT id FROM item_price_history WHERE item_id = $1", [itemId])).rowCount).toBe(0);
      expect((await pool.query("SELECT item_id FROM inventory_item_suppliers WHERE item_id = $1", [itemId])).rowCount).toBe(0);
      const stock = await pool.query("SELECT current_stock, cost_price FROM inventory_items WHERE id = $1", [itemId]);
      expect(Number(stock.rows[0].current_stock)).toBe(3);
      expect(Number(stock.rows[0].cost_price)).toBe(9);

      const created = await request("POST", "/api/purchase-invoices", {
        ...payload, stockItems: [payload.stockItems[0]],
      });
      expect(created.status).toBe(201);
      expect(created.body.asiento_id).toBeTruthy();
      const lines = await pool.query("SELECT line_number, quantity, unit_price, vat_rate, line_total FROM purchase_invoice_lines WHERE invoice_id = $1", [created.body.id]);
      expect(lines.rows).toMatchObject([{ line_number: 1, quantity: "2.000", unit_price: "15.00", vat_rate: "21", line_total: "30.00" }]);
      const detail = await request("GET", `/api/purchase-invoices/${created.body.id}`);
      expect(detail.body.articleLines).toHaveLength(1);
      const movement = await pool.query(
        "SELECT movement_type, source_type, source_id, new_stock, unit_cost FROM stock_movements WHERE item_id = $1",
        [itemId],
      );
      expect(movement.rows).toMatchObject([{
        movement_type: "entrada", source_type: "purchase_invoice", source_id: String(created.body.id),
        new_stock: "5.000", unit_cost: "15.00",
      }]);
      expect((await request("DELETE", `/api/purchase-invoices/${created.body.id}`)).status).toBe(409);
      expect((await pool.query("SELECT estado FROM purchase_invoices WHERE id = $1", [created.body.id])).rows[0].estado).toBe("pendiente");

      await pool.query("DELETE FROM stock_movements WHERE source_type = 'purchase_invoice' AND source_id = $1", [String(created.body.id)]);
      await pool.query("DELETE FROM item_price_history WHERE item_id = $1", [itemId]);
      await pool.query("DELETE FROM inventory_item_suppliers WHERE item_id = $1", [itemId]);
      await pool.query("DELETE FROM accounting_entry_lines WHERE entry_id = $1", [created.body.asiento_id]);
      await pool.query("DELETE FROM accounting_entries WHERE id = $1", [created.body.asiento_id]);
      await pool.query("DELETE FROM purchase_invoices WHERE id = $1", [created.body.id]);
    } finally {
      await pool.query("DELETE FROM inventory_items WHERE id = $1", [itemId]);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplierId]);
    }
  });

  it("registra depósito y stock general juntos con el vínculo al comprobante", async () => {
    if (!pool) return;
    const suffix = randomUUID();
    const supplier = await pool.query<{ id: number }>(
      "INSERT INTO accounting_suppliers (razon_social, cuit, condicion_iva) VALUES ($1, $2, 'responsable_inscripto') RETURNING id",
      [`Proveedor remito ${suffix}`, `31${suffix.replaceAll("-", "").slice(0, 9)}`],
    );
    const item = await pool.query<{ id: string }>(
      "INSERT INTO inventory_items (name, unit, current_stock) VALUES ($1, 'unidad', 1) RETURNING id",
      [`Mercadería ${suffix}`],
    );
    const warehouse = await pool.query<{ id: string }>(
      "INSERT INTO inventory_warehouses (name) VALUES ($1) RETURNING id", [`Depósito ${suffix}`],
    );
    let invoiceId: number | undefined;
    try {
      const created = await request("POST", "/api/purchase-invoices", {
        tipoComprobante: "REMITO", supplierId: supplier.rows[0].id,
        numeroComprobante: `R-${suffix}`, fechaEmision: "2026-09-23", montoNeto: "0",
        stockItems: [
          { itemId: item.rows[0].id, warehouseId: warehouse.rows[0].id, quantity: 2, unitCost: 12 },
          { itemId: item.rows[0].id, warehouseId: null, quantity: 3, unitCost: 12 },
        ],
      });
      expect(created.status).toBe(201);
      invoiceId = created.body.id;
      const global = await pool.query("SELECT current_stock FROM inventory_items WHERE id = $1", [item.rows[0].id]);
      const inWarehouse = await pool.query("SELECT current_stock FROM warehouse_stock WHERE warehouse_id = $1 AND item_id = $2", [warehouse.rows[0].id, item.rows[0].id]);
      expect(Number(global.rows[0].current_stock)).toBe(6);
      expect(Number(inWarehouse.rows[0].current_stock)).toBe(2);
      const movements = await pool.query("SELECT source_id, warehouse_id FROM stock_movements WHERE source_type = 'purchase_invoice' AND source_id = $1", [String(invoiceId)]);
      expect(movements.rows).toHaveLength(2);
      expect(movements.rows.some((row) => row.warehouse_id === warehouse.rows[0].id)).toBe(true);
      expect(movements.rows.some((row) => row.warehouse_id === null)).toBe(true);
    } finally {
      if (invoiceId) {
        await pool.query("DELETE FROM stock_movements WHERE source_type = 'purchase_invoice' AND source_id = $1", [String(invoiceId)]);
        await pool.query("DELETE FROM purchase_invoices WHERE id = $1", [invoiceId]);
      }
      await pool.query("DELETE FROM item_price_history WHERE item_id = $1", [item.rows[0].id]);
      await pool.query("DELETE FROM inventory_item_suppliers WHERE item_id = $1", [item.rows[0].id]);
      await pool.query("DELETE FROM warehouse_stock WHERE item_id = $1", [item.rows[0].id]);
      await pool.query("DELETE FROM inventory_items WHERE id = $1", [item.rows[0].id]);
      await pool.query("DELETE FROM inventory_warehouses WHERE id = $1", [warehouse.rows[0].id]);
      await pool.query("DELETE FROM accounting_suppliers WHERE id = $1", [supplier.rows[0].id]);
    }
  });
});
