import { randomUUID } from "node:crypto";
import express from "express";
import * as http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const invoice = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock("../billing/invoiceService", async (importOriginal) => ({
  ...await importOriginal<typeof import("../billing/invoiceService")>(),
  emitirFactura: invoice.emit,
}));

const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let storage: typeof import("../db-storage").storage;
let server: http.Server, baseUrl: string, categoryId: string, menuId: string;
const orders: string[] = [];

async function request(method: string, path: string, body: unknown) {
  const r = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as any };
}

async function fixture(mode: string) {
  const id = randomUUID();
  await pool!.query(`INSERT INTO restaurant_orders(id,order_number,status,total,opened_at)
    VALUES($1,$2,'open','121.00',NOW())`, [id, `POSTCOMMIT-${id.slice(-8)}`]);
  orders.push(id);
  const item = await storage.createOrderItem({ orderId: id, menuItemId: menuId, quantity: 1, unitPrice: "121.00", subtotal: "121.00" });
  let method = "POST", path = `/api/restaurant/orders/${id}/close`;
  const body: any = { receiptType: "factura_b", emitInvoice: true, paymentMethod: "efectivo", method: "efectivo" };
  if (mode === "split") {
    const split = await storage.createOrderSplit({ orderId: id, splitNumber: 1, amount: "121.00" });
    method = "PATCH";
    path = `/api/restaurant/orders/${id}/split/${split.id}`;
  } else if (mode === "pay-items") {
    path = `/api/restaurant/orders/${id}/pay-items`;
    body.itemIds = [item.id];
  }
  return { id, method, path, body };
}

function mockCommittedInvoice(id: string) {
  invoice.emit.mockReset();
  invoice.emit.mockImplementation(async () => {
    // A separate connection cannot see uncommitted payment state. This also
    // ensures fiscal work is not holding the payment transaction open.
    const order = (await pool!.query("SELECT status FROM restaurant_orders WHERE id=$1", [id])).rows[0];
    const cash = (await pool!.query("SELECT amount FROM cash_movements WHERE source_id=$1", [id])).rows;
    const folio = (await pool!.query("SELECT balance FROM folios WHERE entity_type='restaurant_order' AND entity_id=$1", [id])).rows[0];
    expect(order.status).toBe("closed");
    expect(cash).toEqual([{ amount: "121.00" }]);
    expect(folio.balance).toBe("0.00");
    return { id: 12345 };
  });
}

suite("PostgreSQL: restaurant fiscal call follows the local payment commit", () => {
  beforeAll(async () => {
    ({ storage } = await import("../db-storage"));
    categoryId = (await storage.createMenuCategory({ name: `Postcommit-${randomUUID()}` })).id;
    menuId = (await storage.createMenuItem({ categoryId, name: "Postcommit plate", price: "121.00" })).id;
    const { registerRestaurantRoutes } = await import("../routes/restaurant");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => { req.user = { username: "postcommit-test", role: "admin" }; req.isAuthenticated = () => true; next(); });
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
    await pool.query(`DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_type='restaurant_order' AND entity_id=ANY($1::varchar[]))`, [orders]);
    await pool.query("DELETE FROM folios WHERE entity_type='restaurant_order' AND entity_id=ANY($1::varchar[])", [orders]);
    await pool.query("DELETE FROM order_splits WHERE order_id=ANY($1::varchar[])", [orders]);
    await pool.query("DELETE FROM order_items WHERE order_id=ANY($1::varchar[])", [orders]);
    await pool.query("DELETE FROM restaurant_orders WHERE id=ANY($1::varchar[])", [orders]);
    await pool.query("DELETE FROM menu_items WHERE id=$1", [menuId]);
    await pool.query("DELETE FROM menu_categories WHERE id=$1", [categoryId]);
    await pool.end();
  });

  it.each(["close", "split", "pay-items"])("%s emits after commit and returns its invoice id", async (mode) => {
    const f = await fixture(mode);
    mockCommittedInvoice(f.id);
    const r = await request(f.method, f.path, f.body);
    expect(r.status).toBe(200);
    expect(r.body.invoiceId).toBe(12345);
    expect(invoice.emit).toHaveBeenCalledTimes(1);
  });

  it.each([
    { discount: 122, discountType: 'fixed' },
    { discount: 101, discountType: 'percent' },
    { discount: -1 },
    { discount: 'invalid' },
    { reservationAdvanceCredit: 122 },
    { reservationAdvanceCredit: 'invalid' },
    { reservationAdvanceCredit: -1 },
    { discount: 60, reservationAdvanceCredit: 62 },
  ])('rejects excessive or invalid deductions before closing or emitting (%j)', async deductions => {
    const f = await fixture('close');
    invoice.emit.mockReset();
    const r = await request(f.method, f.path, { ...f.body, ...deductions });
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    expect((await storage.getRestaurantOrder(f.id))!.status).toBe('open');
    expect((await pool!.query('SELECT id FROM cash_movements WHERE source_id=$1', [f.id])).rows).toHaveLength(0);
    expect((await pool!.query("SELECT id FROM folios WHERE entity_type='restaurant_order' AND entity_id=$1", [f.id])).rows).toHaveLength(0);
    expect((await storage.getOrderItems(f.id)).every(item => !item.paid)).toBe(true);
    expect(invoice.emit).not.toHaveBeenCalled();
  });

  it.each([
    { discount: '10', discountType: 'fixed', expected: 111 },
    { discount: 10, discountType: 'percent', expected: 108.9 },
  ])('keeps valid discounts consistent between payment, folio and invoice (%j)', async example => {
    const f = await fixture('close');
    invoice.emit.mockReset().mockResolvedValue({ id: 12345 });
    const r = await request(f.method, f.path, { ...f.body, discount: example.discount, discountType: example.discountType });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(Number(r.body.total)).toBe(example.expected);
    expect(Number((await pool!.query('SELECT amount FROM cash_movements WHERE source_id=$1', [f.id])).rows[0].amount)).toBe(example.expected);
    const payload = invoice.emit.mock.calls[0][0];
    expect(Math.round(payload.items.reduce((sum: number, item: any) => sum + item.subtotal, 0) * 100)).toBe(Math.round(example.expected * 100));
    expect(await storage.getFolioWithMovementsByEntity('restaurant_order', f.id)).toMatchObject({ balance: '0.00' });
  });

  it('preserves the stored line cents when a full discount follows a divided unit price', async () => {
    const f = await fixture('close');
    await storage.updateRestaurantOrder(f.id, { total: '0.01' });
    const [item] = await storage.getOrderItems(f.id);
    await storage.updateOrderItem(item.id, { quantity: 3, unitPrice: '0.00', subtotal: '0.01' });
    invoice.emit.mockReset().mockResolvedValue({ id: 12345 });
    const r = await request(f.method, f.path, { ...f.body, discount: 100, discountType: 'percent' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(Number(r.body.total)).toBe(0);
    const { calcularMontos } = await import('../billing/invoiceService');
    expect(calcularMontos(invoice.emit.mock.calls[0][0].items, 'FB')).toMatchObject({ montoTotal: 0, montoNeto: 0, montoIva21: 0 });
  });

  it("does not emit an invoice for a payment rolled back after fiscal preparation", async () => {
    const f = await fixture("close");
    mockCommittedInvoice(f.id);
    const fault = vi.spyOn(storage, "deductStockFromOrder").mockRejectedValueOnce(new Error("Injected stock failure"));
    try {
      expect((await request(f.method, f.path, f.body)).status).toBe(500);
      expect(invoice.emit).not.toHaveBeenCalled();
      expect((await storage.getRestaurantOrder(f.id))!.status).toBe("open");
    } finally { fault.mockRestore(); }
    expect((await request(f.method, f.path, f.body)).body.invoiceId).toBe(12345);
    expect(invoice.emit).toHaveBeenCalledTimes(1);
  });
});
