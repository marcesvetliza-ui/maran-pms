/**
 * Regresión de 4 bugs reportados en un análisis externo de Restaurant,
 * verificados contra el código real antes de corregirlos:
 *
 * 1. POST /close no tenía guard de idempotencia: un doble click (o dos
 *    requests concurrentes) re-ejecutaba todos los efectos de cierre
 *    (caja, folio, stock) una segunda vez sobre el mismo pedido.
 * 2. PATCH /split/:splitId no registraba movimiento de caja al pagar una
 *    parte en efectivo/tarjeta, ni descontaba stock al completarse el pago
 *    de todas las partes.
 * 3. Un consumo cargado a la habitación (createCharge) quedaba reflejado en
 *    el saldo de la reserva (tabla `charges`) pero nunca en su folio
 *    (`folios`/`folio_movements`, entityType="reservation"), que es lo que
 *    efectivamente imprime "Imprimir Folio".
 * 4. POST /api/restaurant/orders chequeaba "¿hay una orden activa para esta
 *    mesa?" e insertaba sin lock: dos requests concurrentes podían pasar el
 *    chequeo antes de que cualquiera insertara, dejando dos órdenes activas
 *    para la misma mesa.
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

async function createOpenOrder(total: string, extra: Record<string, unknown> = {}): Promise<string> {
  const orderId = randomUUID();
  const cols = ["id", "order_number", "order_type", "status", "total", "opened_at"];
  const vals: any[] = [orderId, `ORD-TEST-${orderId.slice(-8)}`, "dine_in", "open", total];
  const placeholders = ["$1", "$2", "$3", "$4", "$5", "NOW()"];
  let i = 6;
  for (const [key, val] of Object.entries(extra)) {
    cols.push(key);
    vals.push(val);
    placeholders.push(`$${i++}`);
  }
  await pool!.query(
    `INSERT INTO restaurant_orders (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
    vals,
  );
  return orderId;
}

// POST /close escribe el folio del pedido (entityType="restaurant_order")
// en un .then() sin esperarlo (fire-and-forget, server/routes/restaurant.ts
// — el mismo patrón ya documentado en restaurant-invoice-cash-edit.pg.test.ts).
// Sin esperarlo, la limpieza del test puede borrar `folios` mientras ese
// .then() todavía está en vuelo; cuando aterriza, reinserta folio_movements
// contra un folio ya borrado o deja una fila huérfana que choca contra
// folio_movements_folio_id_folios_id_fk al intentar borrar `folios` después.
async function waitForOrderFolioSettled(orderId: string, expectedTotal: number) {
  for (let i = 0; i < 40; i++) {
    const row = await pool!.query(
      "SELECT total_payments FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1",
      [orderId],
    );
    const paid = parseFloat(row.rows[0]?.total_payments ?? "0");
    if (paid >= expectedTotal - 0.01) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Folio del pedido ${orderId} nunca reflejó el pago (fire-and-forget no completó a tiempo)`);
}

async function cleanupOrder(orderId: string) {
  await pool!.query("DELETE FROM order_splits WHERE order_id = $1", [orderId]);
  await pool!.query("DELETE FROM order_items WHERE order_id = $1", [orderId]);
  await pool!.query("DELETE FROM cash_movements WHERE source_type IN ('restaurant_order', 'restaurant_split') AND source_id = $1", [orderId]);
  await pool!.query(`DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1)`, [orderId]);
  await pool!.query("DELETE FROM folios WHERE entity_type = 'restaurant_order' AND entity_id = $1", [orderId]);
  await pool!.query("DELETE FROM stock_movements WHERE source_type = 'restaurant_order' AND source_id = $1", [orderId]);
  await pool!.query("DELETE FROM inventory_consumption_jobs WHERE source_type='restaurant_order' AND source_id=$1",[orderId]);
  await pool!.query("DELETE FROM restaurant_orders WHERE id = $1", [orderId]);
}

function baseReservationData(overrides: Record<string, any> = {}) {
  const id = randomUUID();
  return {
    reservationCode: `RES-TEST-${id}`,
    guestId: `guest-${id}`,
    roomTypeId: `type-${id}`,
    roomId: `room-${id}`,
    checkInDate: "2026-11-01",
    checkOutDate: "2026-11-02",
    nights: 1,
    status: "checked_in" as const,
    createdAt: new Date(),
    ...overrides,
  };
}

async function createReservationFixture(storage: typeof import("../db-storage").storage) {
  const data = baseReservationData();
  await pool!.query(`INSERT INTO room_types (id, code, name) VALUES ($1, $2, 'Restaurant folio test')`, [data.roomTypeId, `RFT-${randomUUID().slice(0, 8)}`]);
  await pool!.query(`INSERT INTO rooms (id, room_number, room_type_id, status) VALUES ($1, $2, $3, 'occupied')`, [data.roomId, `RFT-${randomUUID().slice(0, 8)}`, data.roomTypeId]);
  const reservation = await storage.createReservation(data as any);
  return reservation.id as string;
}

async function cleanupReservationFixture(reservationId: string) {
  await pool!.query(`DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_type = 'reservation' AND entity_id = $1)`, [reservationId]);
  await pool!.query("DELETE FROM folios WHERE entity_type = 'reservation' AND entity_id = $1", [reservationId]);
  await pool!.query("DELETE FROM charges WHERE reservation_id = $1", [reservationId]);
  const row = await pool!.query("SELECT room_id, room_type_id FROM reservations WHERE id = $1", [reservationId]);
  await pool!.query("DELETE FROM reservations WHERE id = $1", [reservationId]);
  if (row.rows[0]) {
    await pool!.query("DELETE FROM rooms WHERE id = $1", [row.rows[0].room_id]);
    await pool!.query("DELETE FROM room_types WHERE id = $1", [row.rows[0].room_type_id]);
  }
}

suite("PostgreSQL real: cierre/split de Restaurant — idempotencia, caja, folio y carrera de mesa", () => {
  let storage: typeof import("../db-storage").storage;

  beforeAll(async () => {
    ({ storage } = await import("../db-storage"));
    const { registerRestaurantRoutes } = await import("../routes/restaurant");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: "restaurant-race-pg", username: "restaurant-race-pg", fullName: "Prueba Restaurant", role: "admin" };
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

  describe("Bug 1 — doble cierre de /close", () => {
    it("un segundo POST /close secuencial sobre el mismo pedido responde 409 y no duplica el movimiento de caja", async () => {
      if (!pool) return;
      const orderId = await createOpenOrder("100.00");
      try {
        const first = await request("POST", `/api/restaurant/orders/${orderId}/close`, { paymentMethod: "efectivo" });
        expect(first.status, JSON.stringify(first.body)).toBe(200);

        const second = await request("POST", `/api/restaurant/orders/${orderId}/close`, { paymentMethod: "efectivo" });
        expect(second.status, JSON.stringify(second.body)).toBe(409);

        const cash = await pool.query(
          "SELECT id FROM cash_movements WHERE source_type = 'restaurant_order' AND source_id = $1",
          [orderId],
        );
        expect(cash.rows).toHaveLength(1);
      } finally {
        await waitForOrderFolioSettled(orderId, 100);
        await cleanupOrder(orderId);
      }
    });

    it("dos POST /close concurrentes sobre el mismo pedido: solo uno gana, el otro recibe 409, caja no se duplica", async () => {
      if (!pool) return;
      const orderId = await createOpenOrder("250.00");
      try {
        const [a, b] = await Promise.all([
          request("POST", `/api/restaurant/orders/${orderId}/close`, { paymentMethod: "efectivo" }),
          request("POST", `/api/restaurant/orders/${orderId}/close`, { paymentMethod: "efectivo" }),
        ]);
        const statuses = [a.status, b.status].sort();
        expect(statuses).toEqual([200, 409]);

        const cash = await pool.query(
          "SELECT id FROM cash_movements WHERE source_type = 'restaurant_order' AND source_id = $1",
          [orderId],
        );
        expect(cash.rows).toHaveLength(1);

        const orderRow = await pool.query("SELECT status FROM restaurant_orders WHERE id = $1", [orderId]);
        expect(orderRow.rows[0].status).toBe("closed");
      } finally {
        await waitForOrderFolioSettled(orderId, 250);
        await cleanupOrder(orderId);
      }
    });
  });

  describe("Bug 2 y 3 — splits: caja, stock y folio de la reserva por cargo a habitación", () => {
    it("un split en efectivo registra movimiento de caja; el último split a la habitación cierra, descuenta stock y escribe el folio de la reserva", async () => {
      if (!pool) return;

      // Fixture: un ítem de menú con receta de 1 unidad de materia prima, para
      // poder verificar que el stock se descuenta al completarse el pago.
      const rawMaterial = await storage.createInventoryItem({
        sku: `TEST-SPLIT-${randomUUID().slice(0, 8)}`, name: "Materia Prima Split Test",
        unit: "un", costPrice: "10", currentStock: "50", itemKind: "materia_prima",
      } as any);
      const warehouseId=randomUUID();
      await pool.query("INSERT INTO inventory_warehouses(id,name) VALUES($1,'Restaurant Test')",[warehouseId]);
      await pool.query("INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES($1,$2,50)",[rawMaterial.id,warehouseId]);
      await pool.query("INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,to_warehouse_id,created_at) VALUES($1,'transferencia',50,0,50,$2,now())",[rawMaterial.id,warehouseId]);
      const category = await storage.createMenuCategory({ name: `Split Test Cat ${randomUUID().slice(0, 6)}` } as any);
      const menuItem = await storage.createMenuItem({ categoryId: category.id, name: "Plato Split Test", price: "300" } as any);
      const recipe = await storage.createRecipe({ isBase: false, menuItemId: menuItem.id } as any);
      await storage.createRecipeIngredient({
        recipeId: recipe.id, inventoryItemId: rawMaterial.id, ingredientName: "Materia Prima Split Test",
        quantity: "2", unit: "un", unitCost: "10",
      } as any);

      const orderId = await createOpenOrder("300.00");
      const reservationId = await createReservationFixture(storage);
      try {
        await storage.createOrderItem({
          orderId, menuItemId: menuItem.id, quantity: 1, unitPrice: "300.00", subtotal: "300.00",
        } as any);

        const splitRes = await request("POST", `/api/restaurant/orders/${orderId}/split`, { parts: 2 });
        expect(splitRes.status, JSON.stringify(splitRes.body)).toBe(201);
        const [split1, split2] = splitRes.body as Array<{ id: string; amount: string }>;
        expect(split1.amount).toBe("150.00");
        expect(split2.amount).toBe("150.00");

        // Parte 1: efectivo — antes no quedaba ningún rastro en Caja.
        const pay1 = await request("PATCH", `/api/restaurant/orders/${orderId}/split/${split1.id}`, { method: "efectivo" });
        expect(pay1.status, JSON.stringify(pay1.body)).toBe(200);
        expect(pay1.body.allPaid).toBe(false);

        const cashAfterFirst = await pool.query(
          "SELECT payment_method, amount FROM cash_movements WHERE source_type = 'restaurant_split' AND source_id = $1",
          [orderId],
        );
        expect(cashAfterFirst.rows).toEqual([{ payment_method: "efectivo", amount: "150.00" }]);

        // Parte 2: a la habitación — antes no generaba movimiento de folio en
        // la reserva (solo el cargo "crudo" en `charges`), y al ser la última
        // parte, el pedido nunca descontaba stock.
        const pay2 = await request("PATCH", `/api/restaurant/orders/${orderId}/split/${split2.id}`, {
          method: "cuenta_habitacion", roomReservationId: reservationId,
        });
        expect(pay2.status, JSON.stringify(pay2.body)).toBe(200);
        expect(pay2.body.allPaid).toBe(true);

        // No se generó un segundo movimiento de caja para la parte de habitación.
        const cashAfterSecond = await pool.query(
          "SELECT id FROM cash_movements WHERE source_type = 'restaurant_split' AND source_id = $1",
          [orderId],
        );
        expect(cashAfterSecond.rows).toHaveLength(1);

        // El cargo a la reserva existe en `charges` (saldo que ve recepción)...
        const charge = await pool.query(
          "SELECT amount, category FROM charges WHERE reservation_id = $1",
          [reservationId],
        );
        expect(charge.rows).toEqual([{ amount: "150.00", category: "restaurant" }]);

        // ...y también en su folio (lo que imprime "Imprimir Folio").
        const folioMovement = await pool.query(`
          SELECT fm.type, fm.amount FROM folio_movements fm
          JOIN folios f ON f.id = fm.folio_id
          WHERE f.entity_type = 'reservation' AND f.entity_id = $1
        `, [reservationId]);
        expect(folioMovement.rows).toEqual([{ type: "charge", amount: "150.00" }]);

        // El pedido quedó cerrado...
        const orderRow = await pool.query("SELECT status FROM restaurant_orders WHERE id = $1", [orderId]);
        expect(orderRow.rows[0].status).toBe("closed");

        // ...y el stock se descontó (2 unidades de materia prima vendida).
        const stockMovement = await pool.query(
          "SELECT quantity, movement_type FROM stock_movements WHERE item_id = $1 AND source_id = $2",
          [rawMaterial.id, orderId],
        );
        expect(stockMovement.rows).toEqual([{ quantity: "2.000", movement_type: "consumo" }]);
      } finally {
        await cleanupOrder(orderId);
        await cleanupReservationFixture(reservationId);
        await pool.query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recipe.id]);
        await pool.query("DELETE FROM recipes WHERE id = $1", [recipe.id]);
        await pool.query("DELETE FROM menu_items WHERE id = $1", [menuItem.id]);
        await pool.query("DELETE FROM menu_categories WHERE id = $1", [category.id]);
        await pool.query("DELETE FROM stock_movements WHERE item_id=$1",[rawMaterial.id]);
        await pool.query("DELETE FROM warehouse_stock WHERE item_id=$1",[rawMaterial.id]);
        await pool.query("DELETE FROM inventory_warehouses WHERE id=$1",[warehouseId]);
        await pool.query("DELETE FROM inventory_items WHERE id = $1", [rawMaterial.id]);
      }
    });
  });

  describe("Bug 3 — /close con cargo a la habitación también escribe el folio de la reserva", () => {
    it("POST /close con chargeToRoom escribe charges Y folio_movements de la reserva", async () => {
      if (!pool) return;
      const orderId = await createOpenOrder("180.00");
      const reservationId = await createReservationFixture(storage);
      try {
        const closed = await request("POST", `/api/restaurant/orders/${orderId}/close`, {
          chargeToRoom: true, roomReservationId: reservationId, paymentMethod: "cuenta_habitacion",
        });
        expect(closed.status, JSON.stringify(closed.body)).toBe(200);

        const charge = await pool.query("SELECT amount FROM charges WHERE reservation_id = $1", [reservationId]);
        expect(charge.rows).toEqual([{ amount: "180.00" }]);

        const folioMovement = await pool.query(`
          SELECT fm.type, fm.amount FROM folio_movements fm
          JOIN folios f ON f.id = fm.folio_id
          WHERE f.entity_type = 'reservation' AND f.entity_id = $1
        `, [reservationId]);
        expect(folioMovement.rows).toEqual([{ type: "charge", amount: "180.00" }]);
      } finally {
        await waitForOrderFolioSettled(orderId, 180);
        await cleanupOrder(orderId);
        await cleanupReservationFixture(reservationId);
      }
    });
  });

  describe("Bug 4 — carrera al abrir mesa", () => {
    it("dos POST /api/restaurant/orders concurrentes para la misma mesa: solo uno crea la orden", async () => {
      if (!pool) return;
      const area = await storage.createRestaurantArea({ name: `Carrera Test ${randomUUID().slice(0, 6)}`, areaType: "indoor" } as any);
      const table = await storage.createRestaurantTable({ tableNumber: `T-${randomUUID().slice(0, 6)}`, areaId: area.id, capacity: 4 } as any);
      try {
        const [a, b] = await Promise.all([
          request("POST", "/api/restaurant/orders", { tableId: table.id, waiterName: "Mozo A" }),
          request("POST", "/api/restaurant/orders", { tableId: table.id, waiterName: "Mozo B" }),
        ]);
        const statuses = [a.status, b.status].sort();
        expect(statuses).toEqual([201, 409]);

        const orders = await pool.query(
          "SELECT id FROM restaurant_orders WHERE table_id = $1 AND status NOT IN ('closed', 'cancelled')",
          [table.id],
        );
        expect(orders.rows).toHaveLength(1);

        for (const row of orders.rows) await cleanupOrder(row.id);
      } finally {
        await pool.query("DELETE FROM restaurant_orders WHERE table_id = $1", [table.id]);
        await pool.query("DELETE FROM restaurant_tables WHERE id = $1", [table.id]);
        await pool.query("DELETE FROM restaurant_areas WHERE id = $1", [area.id]);
      }
    });
  });
});
