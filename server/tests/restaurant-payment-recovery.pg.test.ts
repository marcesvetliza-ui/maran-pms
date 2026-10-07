import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let storage: typeof import("../db-storage").storage;
let server: http.Server;
let baseUrl: string;
let categoryId: string, menuId: string, rawId: string, recipeId: string;
const orders: string[] = [];

async function request(method: string, path: string, body: unknown) {
  const r = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as any };
}

async function fixture(mode: string) {
  const id = randomUUID();
  await pool!.query(`INSERT INTO restaurant_orders(id,order_number,status,total,opened_at)
    VALUES($1,$2,'open','100.01',NOW())`, [id, `RECOVERY-${id.slice(-8)}`]);
  orders.push(id);
  const item = await storage.createOrderItem({ orderId: id, menuItemId: menuId, quantity: 1, unitPrice: "100.01", subtotal: "100.01" });
  let path = `/api/restaurant/orders/${id}/close`, method = "POST";
  const body: any = { receiptType: "ticket", emitInvoice: false, paymentMethod: "efectivo", method: "efectivo" };
  if (mode === "split") {
    // One unpaid installment completes the order and exercises stock rollback.
    const split = await storage.createOrderSplit({ orderId: id, splitNumber: 1, amount: "100.01" });
    path = `/api/restaurant/orders/${id}/split/${split.id}`;
    method = "PATCH";
  } else if (mode === "pay-items") {
    path = `/api/restaurant/orders/${id}/pay-items`;
    body.itemIds = [item.id];
  }
  return { id, path, method, body };
}

async function money(id: string) {
  return (await pool!.query("SELECT amount FROM cash_movements WHERE source_id=$1", [id])).rows;
}

suite("PostgreSQL: restaurant payment rollback and retry", () => {
  const warehouseId=randomUUID();
  beforeAll(async () => {
    ({ storage } = await import("../db-storage"));
    categoryId = (await storage.createMenuCategory({ name: `Recovery-${randomUUID()}` })).id;
    menuId = (await storage.createMenuItem({ categoryId, name: "Recovery plate", price: "100.01" })).id;
    rawId = (await storage.createInventoryItem({ sku: randomUUID(), name: "Recovery ingredient", unit: "kg", costPrice: "10", currentStock: "100", itemKind: "materia_prima" })).id;
    await pool!.query("INSERT INTO inventory_warehouses(id,name) VALUES($1,'Recovery warehouse')",[warehouseId]);
    await pool!.query("INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES($1,$2,100)",[rawId,warehouseId]);
    await pool!.query("INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,to_warehouse_id,created_at) VALUES($1,'transferencia',100,0,100,$2,now())",[rawId,warehouseId]);
    recipeId = (await storage.createRecipe({ isBase: false, menuItemId: menuId })).id;
    await storage.createRecipeIngredient({ recipeId, inventoryItemId: rawId, ingredientName: "Recovery ingredient", quantity: "1", unit: "kg", unitCost: "10", merma: "0" });
    const { registerRestaurantRoutes } = await import("../routes/restaurant");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => { req.user = { id:"recovery-test",username: "recovery-test", role: "admin" }; req.isAuthenticated = () => true; next(); });
    registerRestaurantRoutes(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!pool) return;
    await pool.query("DELETE FROM cash_movements WHERE source_id=ANY($1::varchar[])", [orders]);
    await pool.query("DELETE FROM stock_movements WHERE source_id=ANY($1::varchar[])", [orders]);
    await pool.query(`DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_type='restaurant_order' AND entity_id=ANY($1::varchar[]))`, [orders]);
    await pool.query("DELETE FROM folios WHERE entity_type='restaurant_order' AND entity_id=ANY($1::varchar[])", [orders]);
    await pool.query("DELETE FROM order_splits WHERE order_id=ANY($1::varchar[])", [orders]);
    await pool.query("DELETE FROM order_items WHERE order_id=ANY($1::varchar[])", [orders]);
    await pool.query("DELETE FROM restaurant_orders WHERE id=ANY($1::varchar[])", [orders]);
    await pool.query("DELETE FROM recipe_ingredients WHERE recipe_id=$1", [recipeId]);
    await pool.query("DELETE FROM recipes WHERE id=$1", [recipeId]);
    await pool.query("DELETE FROM menu_items WHERE id=$1", [menuId]);
    await pool.query("DELETE FROM menu_categories WHERE id=$1", [categoryId]);
    await pool.query("DELETE FROM inventory_consumption_jobs WHERE source_id=ANY($1::varchar[])",[orders]);
    await pool.query("DELETE FROM stock_movements WHERE item_id=$1",[rawId]);
    await pool.query("DELETE FROM warehouse_stock WHERE item_id=$1",[rawId]);
    await pool.query("DELETE FROM inventory_warehouses WHERE id=$1",[warehouseId]);
    await pool.query("DELETE FROM audit_logs WHERE user_id='recovery-test'");
    await pool.query("DELETE FROM inventory_items WHERE id=$1", [rawId]);
    await pool.end();
  });

  for (const mode of ["close", "split", "pay-items"] as const) {
    it.each(["cash", "folio", "stock"] as const)(`${mode}: failure in %s rolls back and can be retried`, async (stage) => {
      const f = await fixture(mode);
      const stockBefore = Number((await storage.getInventoryItem(rawId))!.currentStock);
      const method = stage === "cash" ? "registerCashMovement"
        : stage === "stock" ? "deductStockFromOrder"
          : mode === "close" ? "addFolioPayment" : "recordRestaurantPartialPayment";
      const original = storage[method].bind(storage) as (...args: any[]) => Promise<any>;
      // Fail AFTER the real effect to verify rollback, not just early rejection.
      const fault = vi.spyOn(storage, method).mockImplementationOnce(async (...args: any[]) => {
        await original(...args);
        throw new Error(`Injected ${stage} failure`);
      });
      try {
        expect((await request(f.method, f.path, f.body)).status).toBe(500);
        expect((await storage.getRestaurantOrder(f.id))!.status).toBe("open");
        expect((await storage.getOrderItems(f.id)).every((item) => !item.paid)).toBe(true);
        expect((await storage.getOrderSplits(f.id)).every((split) => split.isPaid === "false")).toBe(true);
        expect(await money(f.id)).toHaveLength(0);
        expect(await storage.getFolioByEntity("restaurant_order", f.id)).toBeNull();
        expect(Number((await storage.getInventoryItem(rawId))!.currentStock)).toBe(stockBefore);
        expect((await pool!.query("SELECT id FROM stock_movements WHERE source_id=$1", [f.id])).rows).toHaveLength(0);
      } finally {
        fault.mockRestore();
      }
      expect((await request(f.method, f.path, f.body)).status).toBe(200);
      expect(await money(f.id)).toEqual([{ amount: "100.01" }]);
      expect(await storage.getFolioByEntity("restaurant_order", f.id)).toMatchObject({ totalCharges: "100.01", totalPayments: "100.01", balance: "0.00" });
      expect(Number((await storage.getInventoryItem(rawId))!.currentStock)).toBe(stockBefore - 1);
      expect((await request(f.method, f.path, f.body)).status).toBeGreaterThanOrEqual(400);
      expect(await money(f.id)).toHaveLength(1);
      expect(Number((await storage.getInventoryItem(rawId))!.currentStock)).toBe(stockBefore - 1);
    });
  }

  it("two concurrent item payments are serialized and cannot duplicate money or stock", async () => {
    const f = await fixture("pay-items");
    const stockBefore = Number((await storage.getInventoryItem(rawId))!.currentStock);
    const responses = await Promise.all([request(f.method, f.path, f.body), request(f.method, f.path, f.body)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await money(f.id)).toHaveLength(1);
    expect(Number((await storage.getInventoryItem(rawId))!.currentStock)).toBe(stockBefore - 1);
  });
});
