import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let storage: typeof import("../db-storage").storage;
let server: http.Server;
let baseUrl: string;
const orderIds: string[] = [];
const menuIds: string[] = [];
let categoryId: string;
let reservationId: string;
let roomId: string;
let roomTypeId: string;
let guestId: string;

async function request(method: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

async function order(total = "100.01", prices: string[] = []) {
  const id = randomUUID();
  await pool!.query(
    `INSERT INTO restaurant_orders(id,order_number,status,total,opened_at)
     VALUES($1,$2,'open',$3,NOW())`, [id, `ROUND-${id.slice(-8)}`, total],
  );
  orderIds.push(id);
  const items = [];
  for (const price of prices) {
    const menu = await storage.createMenuItem({ categoryId, name: "Rounding plate", price });
    menuIds.push(menu.id);
    items.push(await storage.createOrderItem({
      orderId: id, menuItemId: menu.id, quantity: 1, unitPrice: price, subtotal: price,
    }));
  }
  return { id, items };
}

async function folio(id: string) {
  return storage.getFolioWithMovementsByEntity("restaurant_order", id);
}

async function expectNoPaymentSideEffects(id: string) {
  expect((await storage.getRestaurantOrder(id))?.status).toBe("open");
  expect((await pool!.query("SELECT id FROM cash_movements WHERE source_id=$1", [id])).rows).toHaveLength(0);
  expect(await folio(id)).toBeNull();
  expect((await storage.getOrderItems(id)).every((item) => !item.paid)).toBe(true);
  expect((await storage.getOrderSplits(id)).every((split) => split.isPaid !== "true")).toBe(true);
}

suite("PostgreSQL: restaurant payment totals, room validation and partial folio", () => {
  beforeAll(async () => {
    ({ storage } = await import("../db-storage"));
    categoryId = (await storage.createMenuCategory({ name: `Rounding-${randomUUID()}` })).id;
    guestId = (await storage.createGuest({ firstName: "Rounding", lastName: "Test" })).id;
    roomTypeId = (await storage.createRoomType({ code: randomUUID().slice(0, 8), name: "Rounding room" })).id;
    roomId = (await storage.createRoom({ roomNumber: randomUUID().slice(0, 8), roomTypeId, status: "occupied" })).id;
    reservationId = (await storage.createReservation({
      reservationCode: `ROUND-${randomUUID()}`, guestId, roomTypeId, roomId,
      checkInDate: "2026-10-05", checkOutDate: "2026-10-06", status: "checked_in", createdAt: new Date(),
    })).id;
    const { registerRestaurantRoutes } = await import("../routes/restaurant");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { username: "rounding-test", role: "admin" };
      req.isAuthenticated = () => true;
      next();
    });
    registerRestaurantRoutes(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!pool) return;
    // Also settle fire-and-forget folio writes when running against old code.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await pool.query("DELETE FROM cash_movements WHERE source_id=ANY($1::varchar[])", [orderIds]);
    await pool.query("DELETE FROM order_splits WHERE order_id=ANY($1::varchar[])", [orderIds]);
    await pool.query("DELETE FROM order_items WHERE order_id=ANY($1::varchar[])", [orderIds]);
    await pool.query(`DELETE FROM folio_movements WHERE folio_id IN
      (SELECT id FROM folios WHERE (entity_type='restaurant_order' AND entity_id=ANY($1::varchar[]))
        OR (entity_type='reservation' AND entity_id=$2))`, [orderIds, reservationId]);
    await pool.query("DELETE FROM folios WHERE entity_id=ANY($1::varchar[])", [[...orderIds, reservationId]]);
    await pool.query("DELETE FROM charges WHERE reservation_id=$1", [reservationId]);
    await pool.query("DELETE FROM restaurant_orders WHERE id=ANY($1::varchar[])", [orderIds]);
    await pool.query("DELETE FROM reservations WHERE id=$1", [reservationId]);
    await pool.query("DELETE FROM rooms WHERE id=$1", [roomId]);
    await pool.query("DELETE FROM room_types WHERE id=$1", [roomTypeId]);
    await pool.query("DELETE FROM guests WHERE id=$1", [guestId]);
    await pool.query("DELETE FROM menu_items WHERE id=ANY($1::varchar[])", [menuIds]);
    await pool.query("DELETE FROM menu_categories WHERE id=$1", [categoryId]);
    await pool.end();
  });

  it.each([
    [{ method: "efectivo", amount: 50 }, { method: "tarjeta_credito", amount: 50 }],
    [{ method: "efectivo", amount: 50 }, { method: "tarjeta_credito", amount: 51 }],
    [{ method: "efectivo", amount: -1 }, { method: "tarjeta_credito", amount: 101.01 }],
    [{ method: "efectivo", amount: "invalid" }, { method: "tarjeta_credito", amount: 100.01 }],
  ])("rejects invalid payment splits without closing or posting money (%j)", async (...paymentSplits) => {
    const o = await order();
    const r = await request("POST", `/api/restaurant/orders/${o.id}/close`, { paymentSplits, receiptType: "ticket" });
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    await expectNoPaymentSideEffects(o.id);
  });

  it.each([undefined, "nonexistent-reservation"])("rejects invalid room reservation (%s)", async (id) => {
    const o = await order();
    const r = await request("POST", `/api/restaurant/orders/${o.id}/close`, {
      paymentSplits: [{ method: "efectivo", amount: 50 }, { method: "cuenta_habitacion", amount: 50.01, roomReservationId: id }],
    });
    expect(r.status).toBe(400);
    await expectNoPaymentSideEffects(o.id);
  });

  it.each([false, true])("discounted sale has no remaining folio balance (combined=%s)", async (combined) => {
    const o = await order();
    const r = await request("POST", `/api/restaurant/orders/${o.id}/close`, {
      discount: 10, discountType: "percent", paymentMethod: "efectivo",
      ...(combined ? { paymentSplits: [{ method: "efectivo", amount: 30 }, { method: "tarjeta_credito", amount: 30 }, { method: "cuenta_habitacion", amount: 30.01, roomReservationId: reservationId }] } : {}),
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await folio(o.id)).toMatchObject({ totalCharges: "90.01", totalPayments: "90.01", balance: "0.00" });
  });

  it("three separately paid parts preserve cents and create the order folio", async () => {
    const o = await order();
    const divided = await request("POST", `/api/restaurant/orders/${o.id}/split`, { parts: 3 });
    expect(divided.body.map((s: any) => s.amount)).toEqual(["33.33", "33.33", "33.35"]);
    for (const [i, split] of divided.body.entries()) {
      const paid = await request("PATCH", `/api/restaurant/orders/${o.id}/split/${split.id}`, {
        method: i === 2 ? "cuenta_habitacion" : "efectivo", roomReservationId: reservationId,
      });
      expect(paid.status, JSON.stringify(paid.body)).toBe(200);
      expect(paid.body.allPaid).toBe(i === 2);
    }
    expect(await folio(o.id)).toMatchObject({ totalCharges: "100.01", totalPayments: "100.01", balance: "0.00" });
    expect((await folio(o.id))!.movements.filter((m) => m.type === "payment")).toHaveLength(3);
  });

  it("combined tenders with the same method are not deduplicated", async () => {
    const o = await order();
    const r = await request("POST", `/api/restaurant/orders/${o.id}/close`, {
      paymentSplits: [{ method: "efectivo", amount: 50 }, { method: "efectivo", amount: 50.01 }],
    });
    expect(r.status).toBe(200);
    expect(await folio(o.id)).toMatchObject({ totalCharges: "100.01", totalPayments: "100.01", balance: "0.00" });
    expect((await folio(o.id))!.movements.filter((m) => m.type === "payment")).toHaveLength(2);
  });

  it("two concurrent payments of the same part record only one receipt and one folio payment", async () => {
    const o = await order("100.00");
    const splits = await request("POST", `/api/restaurant/orders/${o.id}/split`, { parts: 2 });
    const path = `/api/restaurant/orders/${o.id}/split/${splits.body[0].id}`;
    const responses = await Promise.all([
      request("PATCH", path, { method: "efectivo" }), request("PATCH", path, { method: "efectivo" }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await pool!.query("SELECT id FROM cash_movements WHERE source_id=$1", [o.id])).rows).toHaveLength(1);
    expect(await folio(o.id)).toMatchObject({ totalCharges: "50.00", totalPayments: "50.00", balance: "0.00" });
  });

  it("editing a part cannot allow closing an underfunded division", async () => {
    const o = await order();
    const splits = await request("POST", `/api/restaurant/orders/${o.id}/split`, { parts: 2 });
    const path = `/api/restaurant/orders/${o.id}/split/${splits.body[1].id}`;
    expect((await request("PATCH", path, { amount: 50 })).status).toBe(200);
    expect((await request("PATCH", path, { method: "efectivo" })).status).toBe(400);
    await expectNoPaymentSideEffects(o.id);
  });

  it("item payments with the same method and amount remain distinct and discounts are reflected", async () => {
    const o = await order("30.00", ["10.00", "10.00", "10.00"]);
    for (const [i, item] of o.items.entries()) {
      const paid = await request("POST", `/api/restaurant/orders/${o.id}/pay-items`, {
        itemIds: [item.id], method: i === 2 ? "cuenta_habitacion" : "efectivo",
        roomReservationId: reservationId, ...(i === 2 ? { discount: 10, discountType: "percent" } : {}),
      });
      expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    }
    expect(await folio(o.id)).toMatchObject({ totalCharges: "29.00", totalPayments: "29.00", balance: "0.00" });
    expect((await folio(o.id))!.movements.filter((m) => m.type === "payment")).toHaveLength(3);
  });

  it.each(["split", "pay-items"])("invalid room on %s leaves the installment unpaid", async (mode) => {
    const o = await order("100.01", ["100.01"]);
    let path = `/api/restaurant/orders/${o.id}/pay-items`;
    if (mode === "split") {
      const split = await request("POST", `/api/restaurant/orders/${o.id}/split`, { parts: 2 });
      path = `/api/restaurant/orders/${o.id}/split/${split.body[0].id}`;
    }
    const r = await request(mode === "split" ? "PATCH" : "POST", path, {
      method: "cuenta_habitacion", itemIds: [o.items[0].id],
    });
    expect(r.status).toBe(400);
    await expectNoPaymentSideEffects(o.id);
  });
});
