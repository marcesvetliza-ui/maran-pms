import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let server: http.Server, baseUrl: string;
let storage: typeof import("../db-storage").storage;
const orderIds: string[] = [], menuIds: string[] = [];
const categoryId = randomUUID();

async function fixture(course = 1, paid = false) {
  const orderId = randomUUID(), menuId = randomUUID(), itemId = randomUUID();
  orderIds.push(orderId); menuIds.push(menuId);
  await pool!.query("INSERT INTO restaurant_orders (id,order_number,status,total,opened_at,active_course) VALUES ($1,$3,'in_progress',$2,NOW(),1)", [orderId, paid ? '0.00' : '3703.68', `REPEAT-${orderId}`]);
  await pool!.query("INSERT INTO menu_items (id,category_id,name,price,is_editable) VALUES ($1,$2,'Plato personalizado',9999,'true')", [menuId,categoryId]);
  await pool!.query(`INSERT INTO order_items (id,order_id,menu_item_id,quantity,unit_price,subtotal,status,course,notes,sent_at,paid,created_at)
    VALUES ($1,$2,$3,3,1234.56,3703.68,'served',$4,'[Milanesa especial] sin sal',NOW(),$5,NOW()-INTERVAL '1 minute')`, [itemId,orderId,menuId,course,paid]);
  return { orderId, menuId, itemId };
}
async function repeat(orderId: string, itemId: string) {
  const response = await fetch(`${baseUrl}/api/restaurant/orders/${orderId}/items/${itemId}/repeat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    // Repeating never accepts prices, quantities or preparation/payment flags from the client.
    body: JSON.stringify({ quantity: 20, unitPrice: "1", paid: true, status: "served" }),
  });
  return { status: response.status, body: await response.json() as any };
}
suite("Restaurant: repetir una unidad como ítem independiente", () => {
  beforeAll(async () => {
    ({ storage } = await import("../db-storage"));
    const { registerRestaurantRoutes } = await import("../routes/restaurant");
    const app = express(); app.use(express.json());
    app.use((req: any, _res, next) => { req.user = { id: "repeat-test", role: "admin" }; req.isAuthenticated = () => true; next(); });
    registerRestaurantRoutes(app);
    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Sin puerto de prueba");
    baseUrl = `http://127.0.0.1:${address.port}`;
    await pool!.query("INSERT INTO menu_categories (id,name) VALUES ($1,'Repetir ítem prueba')", [categoryId]);
  });
  afterAll(async () => {
    if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    if (pool) {
      await pool.query("DELETE FROM order_items WHERE order_id=ANY($1::varchar[])", [orderIds]);
      await pool.query("DELETE FROM restaurant_orders WHERE id=ANY($1::varchar[])", [orderIds]);
      await pool.query("DELETE FROM menu_items WHERE id=ANY($1::varchar[])", [menuIds]);
      await pool.query("DELETE FROM menu_categories WHERE id=$1", [categoryId]);
      await pool.end();
    }
  });
  it("keeps each repeat separate with the original unit price and notes, ready for individual payment", async () => {
    const f = await fixture();
    const first = await repeat(f.orderId, f.itemId);
    const second = await repeat(f.orderId, first.body.id);
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    expect(first.body).toMatchObject({ quantity: 1, unitPrice: "1234.56", subtotal: "1234.56", notes: "[Milanesa especial] sin sal", course: 1, status: "pending", paid: false, sentAt: null });
    expect(new Set([f.itemId, first.body.id, second.body.id]).size).toBe(3);
    const rows = await storage.getOrderItems(f.orderId);
    expect(rows.find(i => i.id === f.itemId)).toMatchObject({ quantity: 3, subtotal: "3703.68", status: "served" });
    expect(rows.filter(i => i.id !== f.itemId).map(i => i.quantity)).toEqual([1,1]);
    expect((await storage.getRestaurantOrder(f.orderId))?.total).toBe("6172.80");
    const listed = (await storage.getRestaurantOrders()).find(o => o.id === f.orderId)!;
    expect(listed.items.at(-1)?.id).toBe(second.body.id);
    expect(listed.items.every(i => (i as any).createdAt)).toBe(true);
    expect((await pool!.query("SELECT count(*)::int AS n FROM cash_movements WHERE source_id=$1", [f.orderId])).rows[0].n).toBe(0);
  });
  it("copies a paid item into a fresh unpaid unit, retaining its later course without recharging the original", async () => {
    const f = await fixture(3, true);
    const result = await repeat(f.orderId, f.itemId);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ quantity: 1, paid: false, sentAt: null, course: 3, status: "waiting_course" });
    expect((await storage.getRestaurantOrder(f.orderId))?.total).toBe("1234.56");
  });
  it("serializes simultaneous repeats and preserves the total and separate rows", async () => {
    const f = await fixture();
    await pool!.query("UPDATE menu_items SET is_editable='false' WHERE id=$1", [f.menuId]);
    const results = await Promise.all([repeat(f.orderId, f.itemId), repeat(f.orderId, f.itemId)]);
    expect(results.every(result => result.status === 201)).toBe(true);
    expect(new Set(results.map(result => result.body.id)).size).toBe(2);
    expect(await storage.getOrderItems(f.orderId)).toHaveLength(3);
    expect((await storage.getRestaurantOrder(f.orderId))?.total).toBe("6172.80");
  });
  it("rejects closed orders, unavailable dishes and a source from another order without inserting rows", async () => {
    const f = await fixture(), other = await fixture();
    expect((await repeat(f.orderId, other.itemId)).status).toBe(409);
    await pool!.query("UPDATE menu_items SET is_available='false' WHERE id=$1", [f.menuId]);
    expect((await repeat(f.orderId, f.itemId)).status).toBe(409);
    await pool!.query("UPDATE menu_items SET is_available='true' WHERE id=$1", [f.menuId]);
    await pool!.query("UPDATE restaurant_orders SET status='closed' WHERE id=$1", [f.orderId]);
    expect((await repeat(f.orderId, f.itemId)).status).toBe(409);
    expect(await storage.getOrderItems(f.orderId)).toHaveLength(1);
  });
});
