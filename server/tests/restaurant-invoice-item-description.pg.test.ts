/**
 * La descripción de un ítem de Restaurante en la factura AFIP venía de dos
 * fuentes según el camino: el cierre con factura (POST .../close) ya
 * extraía el nombre real de un "Fuera de Menú" desde las notas (formato
 * "[Milanesa napolitana] ..."), pero el cobro parcial (POST .../pay-items)
 * ni siquiera hacía eso — mandaba directo "Ítem restaurante" para TODO ítem,
 * porque ni resolvía el nombre del menú (getOrderItems no trae el join).
 * Ahora ambos caminos aceptan además un override editable por ítem
 * (itemDescriptions) que el mozo/cajero completa justo antes de emitir, y
 * ese override tiene prioridad sobre el nombre extraído de las notas.
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

async function makeMenuItem(name: string): Promise<{ categoryId: string; itemId: string }> {
  const category = await pool!.query<{ id: string }>(
    "INSERT INTO menu_categories (name) VALUES ($1) RETURNING id",
    [`Categoría Test ${randomUUID()}`],
  );
  const item = await pool!.query<{ id: string }>(
    "INSERT INTO menu_items (category_id, name, price) VALUES ($1, $2, '100.00') RETURNING id",
    [category.rows[0].id, name],
  );
  return { categoryId: category.rows[0].id, itemId: item.rows[0].id };
}

async function makeOpenOrderWithItem(menuItemId: string, notes: string | null): Promise<{ orderId: string; itemId: string }> {
  const orderId = randomUUID();
  await pool!.query(
    `INSERT INTO restaurant_orders (id, order_number, order_type, status, total, opened_at)
     VALUES ($1, $2, 'dine_in', 'open', '121.00', NOW())`,
    [orderId, `ORD-TEST-${orderId.slice(-8)}`],
  );
  const item = await pool!.query<{ id: string }>(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal, notes)
     VALUES ($1, $2, 1, '121.00', '121.00', $3) RETURNING id`,
    [orderId, menuItemId, notes],
  );
  return { orderId, itemId: item.rows[0].id };
}

async function cleanup(orderId: string | undefined, invoiceId: number | undefined, categoryId: string | undefined) {
  if (invoiceId) await pool!.query("DELETE FROM sales_invoices WHERE id = $1", [invoiceId]);
  if (orderId) {
    await pool!.query("DELETE FROM cash_movements WHERE source_type IN ('restaurant_order', 'restaurant_partial', 'restaurant_split') AND source_id = $1", [orderId]);
    await pool!.query(`DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1)`, [orderId]);
    await pool!.query("DELETE FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1", [orderId]);
    await pool!.query("DELETE FROM order_splits WHERE order_id = $1", [orderId]);
    await pool!.query("DELETE FROM order_items WHERE order_id = $1", [orderId]);
    await pool!.query("DELETE FROM restaurant_orders WHERE id = $1", [orderId]);
  }
  if (categoryId) {
    await pool!.query("DELETE FROM menu_items WHERE category_id = $1", [categoryId]);
    await pool!.query("DELETE FROM menu_categories WHERE id = $1", [categoryId]);
  }
}

suite("PostgreSQL real: descripción de ítem de Restaurante en la factura", () => {
  beforeAll(async () => {
    const { registerRestaurantRoutes } = await import("../routes/restaurant");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "restaurant-item-desc-pg", username: "restaurant-item-desc-pg", fullName: "Prueba Descripción", role: "admin" };
      req.isAuthenticated = () => true;
      next();
    });
    registerRestaurantRoutes(app);
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

  it("split: factura solo el concepto personalizado y conserva los importes de ambas partes, Caja y Folio", async () => {
    if (!pool) return;
    let orderId: string | undefined, categoryId: string | undefined;
    const invoiceIds: number[] = [];
    try {
      const menu = await makeMenuItem("Fuera de Menú");
      categoryId = menu.categoryId;
      const order = await makeOpenOrderWithItem(menu.itemId, "[Cena romántica]");
      orderId = order.orderId;
      await pool.query("UPDATE restaurant_orders SET total='800000.00' WHERE id=$1", [orderId]);
      await pool.query("UPDATE order_items SET quantity=10,unit_price='80000.00',subtotal='800000.00' WHERE id=$1", [order.itemId]);
      const splits = (await pool.query(
        "INSERT INTO order_splits(order_id,split_number,amount) VALUES($1,1,'240000.00'),($1,2,'560000.00') RETURNING id,split_number,amount",
        [orderId],
      )).rows.sort((a, b) => a.split_number - b.split_number);

      for (const [index, split] of splits.entries()) {
        const method = index === 0 ? "tarjeta_credito" : "mercadopago";
        const paid = await request("PATCH", `/api/restaurant/orders/${orderId}/split/${split.id}`, {
          method, receiptType: "factura_b", emitInvoice: true,
        });
        expect(paid.status, JSON.stringify(paid.body)).toBe(200);
        const invoiceId = Number(paid.body.invoiceId);
        invoiceIds.push(invoiceId);
        expect(invoiceId).toBeGreaterThan(0);
        expect(paid.body.allPaid).toBe(index === 1);
        const invoice = (await pool.query("SELECT items,monto_total,observaciones FROM sales_invoices WHERE id=$1", [invoiceId])).rows[0];
        expect(invoice.monto_total).toBe(split.amount);
        expect(invoice.items).toHaveLength(1);
        expect(invoice.items[0]).toMatchObject({ descripcion: "Cena romántica", cantidad: 1, subtotal: Number(split.amount) });
        expect(invoice.observaciones).toContain(`Parte ${split.split_number}`);
        expect(invoice.observaciones).toContain("ORD-TEST-");
        const cash = (await pool.query("SELECT amount,payment_method FROM cash_movements WHERE source_type='restaurant_split' AND source_id=$1 ORDER BY amount::numeric", [orderId])).rows;
        expect(cash).toHaveLength(index + 1);
        expect(cash[index]).toMatchObject({ amount: split.amount, payment_method: method });
        const folio = (await pool.query("SELECT total_charges,total_payments,balance FROM folios WHERE entity_type='restaurant_order' AND entity_id=$1", [orderId])).rows[0];
        const collected = index === 0 ? "240000.00" : "800000.00";
        expect(folio).toMatchObject({ total_charges: collected, total_payments: collected, balance: "0.00" });
        const remaining = (await pool.query("SELECT coalesce(sum(amount::numeric),0)::numeric(14,2)::text AS amount FROM order_splits WHERE order_id=$1 AND is_paid='false'", [orderId])).rows[0];
        expect(remaining.amount).toBe(index === 0 ? "560000.00" : "0.00");
      }

      const duplicate = await request("PATCH", `/api/restaurant/orders/${orderId}/split/${splits[0].id}`, {
        method: "tarjeta_credito", receiptType: "factura_b", emitInvoice: true,
      });
      expect(duplicate.status).toBe(409);
      expect((await pool.query("SELECT count(*)::int AS count FROM cash_movements WHERE source_type='restaurant_split' AND source_id=$1", [orderId])).rows[0].count).toBe(2);
    } finally {
      for (const id of invoiceIds) if (id) await pool.query("DELETE FROM sales_invoices WHERE id=$1", [id]);
      await cleanup(orderId, undefined, categoryId);
    }
  });

  it("split: reúne conceptos reales sin repetirlos y excluye consumos anulados o sin importe", async () => {
    if (!pool) return;
    let orderId: string | undefined, categoryId: string | undefined, invoiceId: number | undefined;
    try {
      const menu = await makeMenuItem("Cena para dos");
      categoryId = menu.categoryId;
      const order = await makeOpenOrderWithItem(menu.itemId, null);
      orderId = order.orderId;
      await pool.query(
        `INSERT INTO order_items(order_id,menu_item_id,quantity,unit_price,subtotal,notes,status) VALUES
        ($1,$2,1,'121.00','121.00',NULL,'pending'),
        ($1,$2,1,'121.00','121.00','[Postre]','pending'),
        ($1,$2,1,'999.00','999.00','[Producto anulado]','cancelled'),
        ($1,$2,1,'0.00','0.00','[Invitación]','pending')`, [orderId, menu.itemId]);
      await pool.query("UPDATE restaurant_orders SET total='363.00' WHERE id=$1", [orderId]);
      const split = (await pool.query("INSERT INTO order_splits(order_id,split_number,amount) VALUES($1,1,'121.00'),($1,2,'242.00') RETURNING id,split_number", [orderId])).rows.find((s) => s.split_number === 1);
      const paid = await request("PATCH", `/api/restaurant/orders/${orderId}/split/${split.id}`, {
        method: "efectivo", receiptType: "factura_b", emitInvoice: true,
      });
      expect(paid.status, JSON.stringify(paid.body)).toBe(200);
      invoiceId = Number(paid.body.invoiceId);
      const invoice = (await pool.query("SELECT items,monto_total FROM sales_invoices WHERE id=$1", [invoiceId])).rows[0];
      expect(invoice.monto_total).toBe("121.00");
      expect(invoice.items).toHaveLength(1);
      expect(invoice.items[0].descripcion.split("; ").sort()).toEqual(["Cena para dos", "Postre"]);
      expect(invoice.items[0].cantidad).toBe(1);
    } finally {
      await cleanup(orderId, invoiceId, categoryId);
    }
  });

  it("pay-items: sin override usa el nombre real del ítem de menú (antes mandaba 'Ítem restaurante' siempre)", async () => {
    if (!pool) return;
    let orderId: string | undefined, invoiceId: number | undefined, categoryId: string | undefined;
    try {
      const { categoryId: cid, itemId: menuItemId } = await makeMenuItem(`Milanesa napolitana ${randomUUID()}`);
      categoryId = cid;
      const { orderId: oid, itemId } = await makeOpenOrderWithItem(menuItemId, null);
      orderId = oid;

      const paid = await request("POST", `/api/restaurant/orders/${orderId}/pay-items`, {
        itemIds: [itemId], method: "efectivo", receiptType: "factura_b", emitInvoice: true,
      });
      expect(paid.status, JSON.stringify(paid.body)).toBe(200);
      invoiceId = Number(paid.body.invoiceId);
      expect(invoiceId).toBeGreaterThan(0);

      const invoiceRow = await pool.query("SELECT items FROM sales_invoices WHERE id = $1", [invoiceId]);
      const items = invoiceRow.rows[0].items;
      expect(items[0].descripcion).toContain("Milanesa napolitana");
    } finally {
      await cleanup(orderId, invoiceId, categoryId);
    }
  });

  it("pay-items: con 'Fuera de Menú' extrae el nombre real de las notas ([nombre])", async () => {
    if (!pool) return;
    let orderId: string | undefined, invoiceId: number | undefined, categoryId: string | undefined;
    try {
      const { categoryId: cid, itemId: menuItemId } = await makeMenuItem("Fuera de Menú");
      categoryId = cid;
      const { orderId: oid, itemId } = await makeOpenOrderWithItem(menuItemId, "[Bife de chorizo a la parrilla] pedido especial");
      orderId = oid;

      const paid = await request("POST", `/api/restaurant/orders/${orderId}/pay-items`, {
        itemIds: [itemId], method: "efectivo", receiptType: "factura_b", emitInvoice: true,
      });
      expect(paid.status, JSON.stringify(paid.body)).toBe(200);
      invoiceId = Number(paid.body.invoiceId);

      const invoiceRow = await pool.query("SELECT items FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(invoiceRow.rows[0].items[0].descripcion).toBe("Bife de chorizo a la parrilla");
    } finally {
      await cleanup(orderId, invoiceId, categoryId);
    }
  });

  it("pay-items: itemDescriptions (editado antes de cobrar) pisa el nombre de las notas", async () => {
    if (!pool) return;
    let orderId: string | undefined, invoiceId: number | undefined, categoryId: string | undefined;
    try {
      const { categoryId: cid, itemId: menuItemId } = await makeMenuItem("Fuera de Menú");
      categoryId = cid;
      const { orderId: oid, itemId } = await makeOpenOrderWithItem(menuItemId, "[Bife de chorizo a la parrilla]");
      orderId = oid;

      const paid = await request("POST", `/api/restaurant/orders/${orderId}/pay-items`, {
        itemIds: [itemId], method: "efectivo", receiptType: "factura_b", emitInvoice: true,
        itemDescriptions: { [itemId]: "Bife de chorizo (a pedido del huésped, jugoso)" },
      });
      expect(paid.status, JSON.stringify(paid.body)).toBe(200);
      invoiceId = Number(paid.body.invoiceId);

      const invoiceRow = await pool.query("SELECT items FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(invoiceRow.rows[0].items[0].descripcion).toBe("Bife de chorizo (a pedido del huésped, jugoso)");
    } finally {
      await cleanup(orderId, invoiceId, categoryId);
    }
  });

  it("close: itemDescriptions pisa el nombre extraído de las notas", async () => {
    if (!pool) return;
    let orderId: string | undefined, invoiceId: number | undefined, categoryId: string | undefined;
    try {
      const { categoryId: cid, itemId: menuItemId } = await makeMenuItem("Fuera de Menú");
      categoryId = cid;
      const { orderId: oid, itemId } = await makeOpenOrderWithItem(menuItemId, "[Ensalada César]");
      orderId = oid;

      const closed = await request("POST", `/api/restaurant/orders/${orderId}/close`, {
        paymentMethod: "efectivo", receiptType: "factura_b", emitInvoice: true,
        itemDescriptions: { [itemId]: "Ensalada César con pollo grillado (extra)" },
      });
      expect(closed.status, JSON.stringify(closed.body)).toBe(200);
      invoiceId = Number(closed.body.invoiceId);

      const invoiceRow = await pool.query("SELECT items FROM sales_invoices WHERE id = $1", [invoiceId]);
      expect(invoiceRow.rows[0].items[0].descripcion).toBe("Ensalada César con pollo grillado (extra)");
    } finally {
      await cleanup(orderId, invoiceId, categoryId);
    }
  });
});
