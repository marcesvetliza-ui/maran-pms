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

  it.each(["ticket", "voucher_justo", "voucher_room_service"])("fully paid %s closes once without pending folio balance", async receiptType => {
    const o = await order();
    const body = { paymentMethod: "efectivo", receiptType };
    const paid = await request("POST", `/api/restaurant/orders/${o.id}/close`, body);
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    expect((await storage.getRestaurantOrder(o.id))?.status).toBe("closed");
    expect(await folio(o.id)).toMatchObject({ totalCharges: "100.01", totalPayments: "100.01", balance: "0.00" });
    const before = (await pool!.query("SELECT id FROM cash_movements WHERE source_id=$1", [o.id])).rows;
    const replay = await request("POST", `/api/restaurant/orders/${o.id}/close`, body);
    expect(replay.status).toBeGreaterThanOrEqual(400);
    expect((await pool!.query("SELECT id FROM cash_movements WHERE source_id=$1", [o.id])).rows).toEqual(before);
  });

  it("Room Service charges the selected in-house folio once and keeps an informational receipt", async () => {
    const o = await order();
    const body = { receiptType: "voucher_room_service", paymentMethod: "cuenta_habitacion", roomReservationId: reservationId,
      comments: "  Llevar a la habitación. Sin sal.  " };
    expect((await request("POST", `/api/restaurant/orders/${o.id}/close`, body)).status).toBe(200);
    expect((await storage.getRestaurantOrder(o.id))?.notes).toBe("Llevar a la habitación. Sin sal.");
    const charges = (await pool!.query("SELECT amount FROM charges WHERE reservation_id=$1 AND description LIKE $2", [reservationId, `%${(await storage.getRestaurantOrder(o.id))!.orderNumber}%`])).rows;
    expect(charges).toEqual([{ amount: "100.01" }]);
    const cash = (await pool!.query("SELECT payment_method,movement_type,amount FROM cash_movements WHERE source_id=$1", [o.id])).rows;
    expect(cash).toEqual([{ payment_method: "room_charge", movement_type: "informational", amount: "100.01" }]);
    expect((await request("POST", `/api/restaurant/orders/${o.id}/close`, body)).status).toBe(409);
    expect((await pool!.query("SELECT id FROM cash_movements WHERE source_id=$1", [o.id])).rows).toHaveLength(1);
    const pdf = await fetch(`${baseUrl}/api/restaurant/orders/${o.id}/receipt-pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toMatch(/application\/pdf/);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  });

  it.each([
    ["voucher_pedidos_ya", "pedidos_ya"],
    ["voucher_consumo_interno", "consumo_interno"],
    ["voucher_justo", "consumo_interno"],
    ["ticket", "consumo_interno"],
  ])("keeps %s / %s individually visible as Voucher without paying cash out", async (receiptType, paymentMethod) => {
    const o = await order("250.00");
    const result = await request("POST", `/api/restaurant/orders/${o.id}/close`, { receiptType, paymentMethod });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const rows = (await pool!.query("SELECT payment_method,movement_type,amount,source_label,receipt_type FROM cash_movements WHERE source_id=$1", [o.id])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ payment_method: "voucher", movement_type: "informational", amount: "250.00", receipt_type: receiptType });
    expect(rows[0].source_label).toContain(paymentMethod === "pedidos_ya" ? "Pedidos Ya" : "Consumo Interno");
    expect((await storage.getRestaurantOrder(o.id))?.paymentMethod).toBe(paymentMethod);
  });

  it("rejects invalid comments before closing or creating cash and preserves prior notes", async () => {
    const o = await order();
    await storage.updateRestaurantOrder(o.id, { notes: "Nota anterior" });
    expect((await request("POST", `/api/restaurant/orders/${o.id}/close`, { receiptType: "ticket", paymentMethod: "efectivo", comments: "x".repeat(2001) })).status).toBe(400);
    await expectNoPaymentSideEffects(o.id);
    expect((await storage.getRestaurantOrder(o.id))?.notes).toBe("Nota anterior");
    expect((await request("POST", `/api/restaurant/orders/${o.id}/close`, { receiptType: "ticket", paymentMethod: "efectivo" })).status).toBe(200);
    expect((await storage.getRestaurantOrder(o.id))?.notes).toBe("Nota anterior");
  });

  it("records separate cash and internal voucher amounts on a mixed settlement", async () => {
    const o = await order("100.00");
    const result = await request("POST", `/api/restaurant/orders/${o.id}/close`, { receiptType: "ticket",
      paymentSplits: [{ method: "efectivo", amount: 40 }, { method: "consumo_interno", amount: 60 }] });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const rows = (await pool!.query("SELECT payment_method,movement_type,amount FROM cash_movements WHERE source_id=$1 ORDER BY amount", [o.id])).rows;
    expect(rows).toEqual([{ payment_method: "efectivo", movement_type: "income", amount: "40.00" }, { payment_method: "voucher", movement_type: "informational", amount: "60.00" }]);
  });

  it("preserves comments on item payments and retains their full amounts in caja", async () => {
    const o = await order("30.00", ["10.00", "20.00"]);
    for (const item of o.items) {
      const result = await request("POST", `/api/restaurant/orders/${o.id}/pay-items`, {
        itemIds: [item.id], method: "consumo_interno", receiptType: "voucher_consumo_interno", comments: "Turno cocina" });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
    }
    expect((await storage.getRestaurantOrder(o.id))?.notes).toBe("Turno cocina");
    const rows = (await pool!.query("SELECT amount,payment_method,movement_type FROM cash_movements WHERE source_id=$1 ORDER BY amount", [o.id])).rows;
    expect(rows).toEqual([{amount:"10.00",payment_method:"voucher",movement_type:"informational"}, {amount:"20.00",payment_method:"voucher",movement_type:"informational"}]);
    const response = await fetch(`${baseUrl}/api/restaurant/orders/${o.id}/receipt-pdf`);
    expect(response.status).toBe(200);
  });

  it("preserves comments on split payments without extra cash on the room part", async () => {
    const o = await order("100.00");
    const divided = await request("POST", `/api/restaurant/orders/${o.id}/split`, { parts: 2 });
    for (const split of divided.body) {
      const result = await request("PATCH", `/api/restaurant/orders/${o.id}/split/${split.id}`, {
        method: "cuenta_habitacion", receiptType: "voucher_room_service", roomReservationId: reservationId, comments: "Cena habitación" });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
    }
    expect((await storage.getRestaurantOrder(o.id))?.notes).toBe("Cena habitación");
    const rows = (await pool!.query("SELECT amount,payment_method,movement_type FROM cash_movements WHERE source_id=$1", [o.id])).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.movement_type === "informational" && row.payment_method === "room_charge" && row.amount === "50.00")).toBe(true);
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
