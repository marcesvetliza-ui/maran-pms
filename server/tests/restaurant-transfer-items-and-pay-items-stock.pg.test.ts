/**
 * Regresión de 2 defectos reportados en un análisis externo de reintentos de
 * Restaurant, verificados contra el código real antes de corregirlos:
 *
 * 1. POST /transfer-items recalculaba el total de la orden origen y destino
 *    sumando TODOS los ítems (storage.getOrderItems, sin filtrar `paid`), no
 *    solo los pendientes. Si la orden origen ya había cobrado parte de sus
 *    ítems por /pay-items y luego se transfería el resto, el total "pendiente"
 *    volvía a incluir el ítem ya cobrado — y un /close posterior lo cobraba
 *    una segunda vez. Se agrega además un guard explícito: no se puede
 *    transferir un ítem ya cobrado.
 * 2. La rama allPaid de POST /pay-items (completar el pago cobrando todos los
 *    ítems pendientes uno por uno) cerraba la orden sin descontar stock — a
 *    diferencia de /close y /split/:splitId, que sí lo hacen.
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

async function createOpenOrder(total: string): Promise<string> {
  const orderId = randomUUID();
  await pool!.query(
    `INSERT INTO restaurant_orders (id, order_number, order_type, status, total, opened_at)
     VALUES ($1, $2, 'dine_in', 'open', $3, NOW())`,
    [orderId, `ORD-TEST-${orderId.slice(-8)}`, total],
  );
  return orderId;
}

// A diferencia de /close, la rama allPaid de /pay-items nunca escribe el
// folio de "restaurant_order" (ni fire-and-forget ni awaited), así que su
// limpieza no necesita el poll que sí usan los tests de /close.
async function cleanupOrder(orderId: string) {
  await pool!.query("DELETE FROM order_items WHERE order_id = $1", [orderId]);
  await pool!.query("DELETE FROM cash_movements WHERE source_type IN ('restaurant_order', 'restaurant_partial') AND source_id = $1", [orderId]);
  await pool!.query(`DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1)`, [orderId]);
  await pool!.query("DELETE FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1", [orderId]);
  await pool!.query("DELETE FROM stock_movements WHERE source_type = 'restaurant_order' AND source_id = $1", [orderId]);
  await pool!.query("DELETE FROM restaurant_orders WHERE id = $1", [orderId]);
}

suite("PostgreSQL real: transfer-items y pay-items de Restaurant", () => {
  let storage: typeof import("../db-storage").storage;

  beforeAll(async () => {
    ({ storage } = await import("../db-storage"));
    const { registerRestaurantRoutes } = await import("../routes/restaurant");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "restaurant-transfer-pg", username: "restaurant-transfer-pg", fullName: "Prueba Restaurant", role: "admin" };
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

  describe("Defecto 1 — transferir ítems pendientes no debe recobrar lo ya pagado", () => {
    it("tras cobrar el plato y transferir solo la bebida, el origen queda en 0 (no en el monto ya cobrado)", async () => {
      if (!pool) return;
      const sourceId = await createOpenOrder("12000.00");
      const targetId = await createOpenOrder("0.00");
      try {
        const plato = await storage.createOrderItem({
          orderId: sourceId, menuItemId: randomUUID(), quantity: 1, unitPrice: "10000.00", subtotal: "10000.00",
        } as any);
        const bebida = await storage.createOrderItem({
          orderId: sourceId, menuItemId: randomUUID(), quantity: 1, unitPrice: "2000.00", subtotal: "2000.00",
        } as any);

        // Cobrar el plato por pay-items — deja $2000 pendientes en el origen.
        const paid = await request("POST", `/api/restaurant/orders/${sourceId}/pay-items`, {
          itemIds: [plato.id], method: "efectivo",
        });
        expect(paid.status, JSON.stringify(paid.body)).toBe(200);
        expect(paid.body.allPaid).toBe(false);
        expect(paid.body.remainingTotal).toBe("2000.00");

        // Transferir la bebida (lo único pendiente) a otra orden.
        const transfer = await request("POST", `/api/restaurant/orders/${sourceId}/transfer-items`, {
          itemIds: [bebida.id], targetOrderId: targetId,
        });
        expect(transfer.status, JSON.stringify(transfer.body)).toBe(200);

        const sourceRow = await pool.query("SELECT total FROM restaurant_orders WHERE id = $1", [sourceId]);
        // Antes del fix: volvía a sumar el plato ya cobrado y daba "10000.00".
        expect(sourceRow.rows[0].total).toBe("0.00");

        const targetRow = await pool.query("SELECT total FROM restaurant_orders WHERE id = $1", [targetId]);
        expect(targetRow.rows[0].total).toBe("2000.00");
      } finally {
        await cleanupOrder(sourceId);
        await cleanupOrder(targetId);
      }
    });

    it("rechaza transferir un ítem ya cobrado, aunque la orden siga abierta por otros ítems pendientes", async () => {
      if (!pool) return;
      const sourceId = await createOpenOrder("12000.00");
      const targetId = await createOpenOrder("0.00");
      try {
        const plato = await storage.createOrderItem({
          orderId: sourceId, menuItemId: randomUUID(), quantity: 1, unitPrice: "10000.00", subtotal: "10000.00",
        } as any);
        await storage.createOrderItem({
          orderId: sourceId, menuItemId: randomUUID(), quantity: 1, unitPrice: "2000.00", subtotal: "2000.00",
        } as any);

        const paid = await request("POST", `/api/restaurant/orders/${sourceId}/pay-items`, {
          itemIds: [plato.id], method: "efectivo",
        });
        expect(paid.status, JSON.stringify(paid.body)).toBe(200);
        expect(paid.body.allPaid).toBe(false);

        // La orden sigue abierta (queda la bebida pendiente), pero el ítem ya
        // cobrado no se puede transferir.
        const transfer = await request("POST", `/api/restaurant/orders/${sourceId}/transfer-items`, {
          itemIds: [plato.id], targetOrderId: targetId,
        });
        expect(transfer.status, JSON.stringify(transfer.body)).toBe(400);
        expect(transfer.body.error).toMatch(/ya cobrados/);
      } finally {
        await cleanupOrder(sourceId);
        await cleanupOrder(targetId);
      }
    });
  });

  describe("Defecto 2 — completar el pago por ítems debe descontar stock", () => {
    it("al pagar el último ítem pendiente por pay-items, la orden cierra y descuenta la materia prima", async () => {
      if (!pool) return;
      const rawMaterial = await storage.createInventoryItem({
        sku: `TEST-PAYITEMS-${randomUUID().slice(0, 8)}`, name: "Materia Prima Pay-Items Test",
        unit: "un", costPrice: "10", currentStock: "50", itemKind: "materia_prima",
      } as any);
      const category = await storage.createMenuCategory({ name: `Pay-Items Test Cat ${randomUUID().slice(0, 6)}` } as any);
      const menuItem = await storage.createMenuItem({ categoryId: category.id, name: "Plato Pay-Items Test", price: "10000" } as any);
      const recipe = await storage.createRecipe({ isBase: false, menuItemId: menuItem.id } as any);
      await storage.createRecipeIngredient({
        recipeId: recipe.id, inventoryItemId: rawMaterial.id, ingredientName: "Materia Prima Pay-Items Test",
        quantity: "3", unit: "un", unitCost: "10",
      } as any);

      const orderId = await createOpenOrder("10000.00");
      try {
        const item = await storage.createOrderItem({
          orderId, menuItemId: menuItem.id, quantity: 1, unitPrice: "10000.00", subtotal: "10000.00",
        } as any);

        const paid = await request("POST", `/api/restaurant/orders/${orderId}/pay-items`, {
          itemIds: [item.id], method: "efectivo",
        });
        expect(paid.status, JSON.stringify(paid.body)).toBe(200);
        expect(paid.body.allPaid).toBe(true);

        const orderRow = await pool.query("SELECT status FROM restaurant_orders WHERE id = $1", [orderId]);
        expect(orderRow.rows[0].status).toBe("closed");

        const stockMovement = await pool.query(
          "SELECT quantity, movement_type FROM stock_movements WHERE item_id = $1 AND source_id = $2",
          [rawMaterial.id, orderId],
        );
        // Antes del fix: ninguna fila — pay-items cerraba sin descontar stock.
        expect(stockMovement.rows).toEqual([{ quantity: "3.000", movement_type: "consumo" }]);
      } finally {
        await cleanupOrder(orderId);
        await pool.query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recipe.id]);
        await pool.query("DELETE FROM recipes WHERE id = $1", [recipe.id]);
        await pool.query("DELETE FROM menu_items WHERE id = $1", [menuItem.id]);
        await pool.query("DELETE FROM menu_categories WHERE id = $1", [category.id]);
        await pool.query("DELETE FROM inventory_items WHERE id = $1", [rawMaterial.id]);
      }
    });
  });
});
