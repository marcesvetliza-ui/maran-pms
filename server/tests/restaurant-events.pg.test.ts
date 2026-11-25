import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  failInvoice: false,
  actualInvoice: false,
  invoices: new Map<string, number>(),
  requests: [] as any[],
}));
vi.mock("../billing/invoiceService", () => ({
  emitirFactura: vi.fn(async (data: any) => {
    if (fixture.failInvoice) throw Error("Synthetic ARCA unavailable");
    fixture.requests.push(data);
    if (fixture.actualInvoice) {
      const actual = await vi.importActual<
        typeof import("../billing/invoiceService")
      >("../billing/invoiceService");
      const r = await actual.emitirFactura(data);
      fixture.invoices.set(data.operationId, r.id);
      return r;
    }
    const { pool } = await import("../db");
    if (fixture.invoices.has(data.operationId))
      return { id: fixture.invoices.get(data.operationId) };
    const total = data.items.reduce((n: number, i: any) => n + i.subtotal, 0);
    const r = await pool.query(
      `INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,restaurant_order_id,estado) VALUES($1,88652,$2,CURRENT_DATE,$3,'consumidor_final',$4,$4,$5,'emitida') RETURNING id`,
      [
        data.tipoComprobante,
        (Date.now() % 100000000) + fixture.invoices.size,
        data.cliente.razonSocial,
        total,
        data.restaurantOrderId || null,
      ],
    );
    fixture.invoices.set(data.operationId, r.rows[0].id);
    return { id: r.rows[0].id };
  }),
}));
const url = process.env.DATABASE_URL;
if (url && !/test/i.test(new URL(url).pathname))
  throw Error("Disposable test database required");
let pool: any,
  storage: any,
  service: typeof import("../restaurantEvents"),
  today: string,
  server: Server,
  base: string,
  area: any,
  category: any,
  product: any,
  raw: any,
  warehouse: any,
  table1: any,
  table2: any,
  ordinaryArea: any,
  ordinaryTable: any;
const actor = "restaurant-event-test-" + randomUUID(),
  events: string[] = [],
  reservations: string[] = [],
  operations: string[] = [];
const shifts: string[] = [],
  extraOrders: string[] = [];
const op = () => {
  const id = randomUUID();
  operations.push(id);
  return id;
};
async function request(method: string, path: string, data?: any, auth = true) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-test-auth": auth ? "yes" : "no",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: r.status, body: await r.json() };
}
async function event(extra: any = {}) {
  const r = await service.createRestaurantEvent(
    {
      operationId: op(),
      name: "Synthetic Navidad",
      description: "Cena y bebida incluidas",
      areaId: area.id,
      date: today,
      time: "20:00",
      endTime: "23:59",
      capacity: 20,
      adultPrice: "100.01",
      childPrice: "50.00",
      menu: [{ menuItemId: product.id, audience: "all", quantity: 1 }],
      ...extra,
    },
    actor,
  );
  events.push(r.id);
  return r.id;
}
async function reserve(e: string, extra: any = {}) {
  const r = await service.createRestaurantEventBooking(
    e,
    {
      operationId: op(),
      guestName: "Synthetic Family",
      guestPhone: "123456",
      guestEmail: "",
      adults: 2,
      children: 1,
      notes: "Sin cerdo",
      ...extra,
    },
    actor,
  );
  reservations.push(r.id);
  return r.id;
}
async function advance(id: string, amount: string, operationId = op()) {
  return service.collectRestaurantEventAdvance(
    id,
    {
      operationId,
      amount,
      method: "efectivo",
      receiptType: "ticket",
      dni: "",
      notes: "Test only",
    },
    actor,
  );
}
async function assigned(id: string, ids = [table1.id]) {
  return service.assignRestaurantEventTables(
    id,
    { operationId: op(), tableIds: ids },
    actor,
  );
}
describe.skipIf(!url)(
  "Evento restaurant · real PostgreSQL, cash, kitchen and stock",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      ({ storage } = await import("../db-storage"));
      service = await import("../restaurantEvents");
      today = (await import("../db-storage")).getArgentinaToday();
      area = await storage.createRestaurantArea({
        name: actor,
        areaType: "event",
        capacity: 30,
        isActive: "true",
      });
      category = await storage.createMenuCategory({ name: actor });
      raw = await storage.createInventoryItem({
        sku: actor,
        name: "Synthetic food",
        unit: "kg",
        costPrice: "1",
        currentStock: "100",
        itemKind: "materia_prima",
      });
      warehouse = (
        await pool.query(
          `INSERT INTO inventory_warehouses(id,name) VALUES($1::varchar,$1::text) RETURNING id`,
          [actor],
        )
      ).rows[0];
      await pool.query(
        "INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES($1,$2,100)",
        [raw.id, warehouse.id],
      );
      await pool.query(
        `INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,to_warehouse_id,warehouse_id,created_at) VALUES($1,'transferencia',100,0,100,$2,$2,now())`,
        [raw.id, warehouse.id],
      );
      product = await storage.createMenuItem({
        categoryId: category.id,
        name: "Synthetic main course",
        price: "999.00",
      });
      const recipe = await storage.createRecipe({
        menuItemId: product.id,
        name: actor,
      });
      await storage.createRecipeIngredient({
        recipeId: recipe.id,
        inventoryItemId: raw.id,
        ingredientName: raw.name,
        quantity: "1",
        unit: "kg",
        unitCost: "1",
        merma: "0",
      });
      table1 = await storage.createRestaurantTable({
        tableNumber: "E1",
        areaId: area.id,
        capacity: 4,
        status: "available",
      });
      table2 = await storage.createRestaurantTable({
        tableNumber: "E2",
        areaId: area.id,
        capacity: 4,
        status: "available",
      });
      await pool.query(
        `INSERT INTO pos_configs(nombre,numero,area,tipo,activo) VALUES($1,88652,'restaurant','fiscal',true)`,
        [actor],
      );
      ordinaryArea = await storage.createRestaurantArea({name: actor + '-ordinary', areaType: 'indoor', capacity: 20, isActive: 'true'});
      ordinaryTable = await storage.createRestaurantTable({tableNumber: 'O1', areaId: ordinaryArea.id, capacity: 4, status: 'available'});
      const app = express();
      app.use(express.json());
      app.use((req: any, _res, next) => {
        req.user = { id: actor, username: actor, role: "admin" };
        req.isAuthenticated = () => req.headers["x-test-auth"] !== "no";
        next();
      });
      (
        await import("../restaurantEventsRoutes")
      ).registerRestaurantEventsRoutes(app);
      (await import("../routes/restaurant")).registerRestaurantRoutes(app);
      (await import("../routes/events")).registerEventsRoutes(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve) => server.once("listening", resolve));
      base = "http://127.0.0.1:" + (server.address() as any).port;
    });
    afterAll(async () => {
      if (server)
        await new Promise<void>((resolve) => server.close(() => resolve()));
      if (!pool || !table2) return;
      const orders = (
        await pool.query(
          "SELECT order_id FROM restaurant_event_services WHERE reservation_id=ANY($1::varchar[])",
          [reservations],
        )
      ).rows
        .map((r: any) => r.order_id)
        .concat(extraOrders);
      await pool.query(
        "DELETE FROM restaurant_event_advance_applications WHERE order_id=ANY($1::varchar[])",
        [orders],
      );
      await pool.query(
        "DELETE FROM restaurant_event_collections WHERE advance_id IN(SELECT id FROM restaurant_reservation_advances WHERE reservation_id=ANY($1::varchar[]))",
        [reservations],
      );
      await pool.query(
        "DELETE FROM cash_movements WHERE registered_by=$1 OR source_id=ANY($2::varchar[])",
        [actor, orders],
      );
      await pool.query(
        "DELETE FROM restaurant_reservation_advances WHERE reservation_id=ANY($1::varchar[])",
        [reservations],
      );
      await pool.query(
        "DELETE FROM restaurant_event_final_documents WHERE order_id=ANY($1::varchar[])",
        [orders],
      );
      await pool.query(
        "DELETE FROM restaurant_event_services WHERE reservation_id=ANY($1::varchar[])",
        [reservations],
      );
      await pool.query(
        "DELETE FROM order_items WHERE order_id=ANY($1::varchar[])",
        [orders],
      );
      await pool.query(
        "DELETE FROM folio_movements WHERE folio_id IN(SELECT id FROM folios WHERE entity_id=ANY($1::varchar[]))",
        [orders],
      );
      await pool.query(
        "DELETE FROM folios WHERE entity_id=ANY($1::varchar[])",
        [orders],
      );
      await pool.query(
        "DELETE FROM inventory_consumption_jobs WHERE source_id=ANY($1::varchar[])",
        [orders],
      );
      await pool.query(
        "DELETE FROM stock_movements WHERE source_id=ANY($1::varchar[]) OR item_id=$2",
        [orders, raw.id],
      );
      await pool.query(
        "DELETE FROM restaurant_orders WHERE id=ANY($1::varchar[])",
        [orders],
      );
      await pool.query(
        "DELETE FROM restaurant_event_assignments WHERE reservation_id=ANY($1::varchar[])",
        [reservations],
      );
      await pool.query(
        "DELETE FROM restaurant_event_bookings WHERE reservation_id=ANY($1::varchar[])",
        [reservations],
      );
      await pool.query(
        "DELETE FROM table_reservations WHERE id=ANY($1::varchar[])",
        [reservations],
      );
      await pool.query(
        "DELETE FROM restaurant_events WHERE event_id=ANY($1::varchar[])",
        [events],
      );
      await pool.query("DELETE FROM events WHERE id=ANY($1::varchar[])", [
        events,
      ]);
      await pool.query("DELETE FROM event_rooms WHERE id=$1", [
        "restaurant-event-area-" + area.id,
      ]);
      await pool.query("DELETE FROM restaurant_tables WHERE area_id=$1", [
        area.id,
      ]);
      await pool.query("DELETE FROM restaurant_areas WHERE id=$1", [area.id]);
      await pool.query("DELETE FROM restaurant_tables WHERE area_id=$1", [ordinaryArea.id]);
      await pool.query("DELETE FROM restaurant_areas WHERE id=$1", [ordinaryArea.id]);
      await pool.query(
        "DELETE FROM recipe_ingredients WHERE recipe_id IN(SELECT id FROM recipes WHERE menu_item_id=$1)",
        [product.id],
      );
      await pool.query("DELETE FROM recipes WHERE menu_item_id=$1", [
        product.id,
      ]);
      await pool.query("DELETE FROM menu_items WHERE id=$1", [product.id]);
      await pool.query("DELETE FROM menu_categories WHERE id=$1", [
        category.id,
      ]);
      await pool.query("DELETE FROM warehouse_stock WHERE item_id=$1", [
        raw.id,
      ]);
      await pool.query("DELETE FROM inventory_warehouses WHERE id=$1", [
        warehouse.id,
      ]);
      await pool.query("DELETE FROM inventory_items WHERE id=$1", [raw.id]);
      await pool.query("DELETE FROM pos_configs WHERE nombre=$1", [actor]);
      await pool.query("DELETE FROM cash_shifts WHERE id=ANY($1::varchar[])", [
        shifts,
      ]);
      await pool.query("DELETE FROM sales_invoices WHERE id=ANY($1::int[])", [
        [...fixture.invoices.values()],
      ]);
      await pool.query("DELETE FROM audit_logs WHERE user_id=$1", [actor]);
      await pool.query(
        "DELETE FROM restaurant_event_operations WHERE id=ANY($1::uuid[])",
        [operations],
      );
    });
    it("requires authentication and keeps the pilot unavailable in production", async () => {
      expect(
        (await request("GET", "/api/restaurant/events", undefined, false))
          .status,
      ).toBe(401);
      const env = await import("../app-env");
      env.resetAppEnvForTests();
      env.initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
      try {
        expect((await request("GET", "/api/restaurant/events")).status).toBe(
          404,
        );
      } finally {
        env.resetAppEnvForTests();
        env.initAppEnv({ APP_ENV: "test", NODE_ENV: "test" });
      }
    });
    it("creates a canonical table_event and a reservation with no table, preserving the agreed menu price", async () => {
      const e = await event(),
        id = await reserve(e);
      const d = await service.restaurantEventDetail(e);
      expect(d.bookings[0]).toMatchObject({
        reservation_id: id,
        contracted_total: "250.02",
        tables: [],
        advances: "0",
      });
      expect((await storage.getEvent(e)).eventType).toBe("table_event");
      expect(
        (await storage.getEvents()).some((item: any) => item.id === e),
      ).toBe(false);
      expect(
        (await storage.getTableReservations()).some((r: any) => r.id === id),
      ).toBe(false);
    });
    it("enforces capacity atomically for concurrent reservations", async () => {
      const e = await event({ capacity: 3 });
      const result = await Promise.allSettled([reserve(e), reserve(e)]);
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await service.restaurantEventDetail(e)).event.persons).toBe(3);
    });
    it("accumulates two advances, posts once in the receiving shift and is idempotent", async () => {
      const e = await event(),
        id = await reserve(e),
        operationId = op();
      const values = await Promise.all([
        advance(id, "40.00", operationId),
        advance(id, "40.00", operationId),
      ]);
      expect(values[0].id).toBe(values[1].id);
      await advance(id, "30.00");
      const d = await service.restaurantEventDetail(e);
      expect(d.bookings[0].advances).toBe("70.00");
      expect(d.bookings[0].payments).toHaveLength(2);
      const cash = await pool.query(
        `SELECT area,source_type,amount FROM cash_movements WHERE source_id IN(SELECT id FROM restaurant_reservation_advances WHERE reservation_id=$1)`,
        [id],
      );
      expect(cash.rows).toHaveLength(2);
      expect(
        cash.rows.every(
          (r: any) =>
            r.area === "restaurant" &&
            r.source_type === "restaurant_event_advance",
        ),
      ).toBe(true);
      await expect(advance(id, "200.00")).rejects.toThrow("supera");
      await expect(advance(id, "41.00", operationId)).rejects.toThrow(
        "otros datos",
      );
    });
    it("keeps pending fiscal documentation retryable without duplicating collection", async () => {
      const e = await event(),
        id = await reserve(e),
        a = await advance(id, "10.00");
      fixture.failInvoice = true;
      expect(
        (await service.completeEventAdvanceDocument(a.id)).documentStatus,
      ).toBe("pending");
      fixture.failInvoice = false;
      expect(
        (await service.completeEventAdvanceDocument(a.id)).documentStatus,
      ).toBe("completed");
      await service.completeEventAdvanceDocument(a.id);
      expect(
        (
          await pool.query("SELECT * FROM cash_movements WHERE source_id=$1", [
            a.id,
          ])
        ).rows,
      ).toHaveLength(1);
      const { enrichCashDocumentEvidence } =
        await import("../cash-document-evidence");
      const cm = (
        await pool.query(
          'SELECT id,source_type AS "sourceType",source_id AS "sourceId",payment_id AS "paymentId",receipt_type AS "receiptType" FROM cash_movements WHERE source_id=$1',
          [a.id],
        )
      ).rows;
      expect((await enrichCashDocumentEvidence(cm))[0].documentClass).toBe(
        "non_fiscal",
      );
    });
    it("assigns several physical tables and preserves reservation advances while changing them", async () => {
      const e = await event(),
        id = await reserve(e, { adults: 5, children: 0 });
      await advance(id, "20.00");
      await expect(assigned(id, [table1.id])).rejects.toThrow("capacidad");
      await assigned(id, [table1.id, table2.id]);
      await assigned(id, []);
      expect(
        (await service.restaurantEventDetail(e)).bookings[0],
      ).toMatchObject({ tables: [], advances: "20.00" });
    });
    it("rejects table conflicts across events and allows the same table on another date", async () => {
      const e = await event(),
        a = await reserve(e);
      await assigned(a);
      const e2 = await event(),
        b = await reserve(e2);
      await expect(assigned(b)).rejects.toThrow("asignada");
      const tomorrow = (await import("@shared/nightAuditDate")).addCalendarDays(
        today,
        1,
      );
      const e3 = await event({ date: tomorrow }),
        c = await reserve(e3);
      await assigned(c);
      expect(
        (await service.restaurantEventDetail(e3)).bookings[0].tables,
      ).toHaveLength(1);
      await assigned(a, []);
      await assigned(c, []);
    });
    it("preserves advances on cancellation and excludes cancelled reservations from capacity", async () => {
      const e = await event(),
        id = await reserve(e);
      await advance(id, "20.00");
      await service.cancelRestaurantEventBooking(
        id,
        op(),
        "Cliente canceló",
        actor,
      );
      const d = await service.restaurantEventDetail(e);
      expect(d.event.persons).toBe(0);
      expect(d.bookings[0]).toMatchObject({
        status: "cancelled",
        advances: "20.00",
      });
      expect(
        (
          await request("PATCH", "/api/restaurant/table-reservations/" + id, {
            guestName: "Bypass",
          })
        ).status,
      ).toBe(409);
    });
    it("keeps the agreed price when the event price is changed for new reservations", async () => {
      const e = await event(),
        id = await reserve(e);
      await service.updateRestaurantEvent(
        e,
        {
          operationId: op(),
          name: "Updated event",
          description: "New menu terms",
          areaId: area.id,
          date: today,
          time: "20:00",
          endTime: "23:59",
          capacity: 20,
          adultPrice: "200.00",
          childPrice: "100.00",
          menu: [{ menuItemId: product.id, audience: "all", quantity: 1 }],
        },
        actor,
      );
      const old = (await service.restaurantEventDetail(e)).bookings.find(
        (b) => b.reservation_id === id,
      );
      expect(old).toMatchObject({
        adult_price: "100.01",
        child_price: "50.00",
        contracted_total: "250.02",
        includes: "Cena y bebida incluidas",
      });
      const next = await reserve(e);
      expect(
        (await service.restaurantEventDetail(e)).bookings.find(
          (b) => b.reservation_id === next,
        ).contracted_total,
      ).toBe("500.00");
    });
    it("preserves each payment in its actual receiving shift", async () => {
      const e = await event(),
        id = await reserve(e);
      const create = async (offset: number) => {
        const sid = randomUUID();
        shifts.push(sid);
        await pool.query(
          `INSERT INTO cash_shifts(id,area,shift_number,opened_by,opened_at,status) VALUES($1,'restaurant',(SELECT COALESCE(max(shift_number),0)+1 FROM cash_shifts WHERE area='restaurant'),$2,now()+($3||' seconds')::interval,'open')`,
          [sid, actor, String(offset)],
        );
        return sid;
      };
      const first = await create(10),
        a = await advance(id, "10.00");
      await pool.query(
        `UPDATE cash_shifts SET status='closed',closed_at=now() WHERE id=$1`,
        [first],
      );
      const second = await create(20),
        b = await advance(id, "20.00");
      expect(
        (
          await pool.query(
            "SELECT shift_id FROM cash_movements WHERE source_id=$1",
            [a.id],
          )
        ).rows[0].shift_id,
      ).toBe(first);
      expect(
        (
          await pool.query(
            "SELECT shift_id FROM cash_movements WHERE source_id=$1",
            [b.id],
          )
        ).rows[0].shift_id,
      ).toBe(second);
    });
    it("rolls back both the advance and cash when the audit cannot be saved", async () => {
      const e = await event(),
        id = await reserve(e);
      const spy = vi
        .spyOn(storage, "createAuditLog")
        .mockRejectedValueOnce(Error("Synthetic audit failure"));
      try {
        await expect(advance(id, "10.00")).rejects.toThrow("audit");
      } finally {
        spy.mockRestore();
      }
      expect(
        (
          await pool.query(
            "SELECT id FROM restaurant_reservation_advances WHERE reservation_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (await service.restaurantEventDetail(e)).bookings[0].advances,
      ).toBe("0");
    });
    it("creates one real local ticket under concurrent retries and classifies its collection", async () => {
      const e = await event(),
        id = await reserve(e),
        a = await advance(id, "10.00");
      fixture.actualInvoice = true;
      try {
        const results = await Promise.all([
          service.completeEventAdvanceDocument(a.id),
          service.completeEventAdvanceDocument(a.id),
        ]);
        expect(results[0].documentStatus).toBe("completed");
        expect(results[0].invoiceId).toBe(results[1].invoiceId);
        expect(
          (
            await pool.query(
              "SELECT reconciliation_status,monto_total FROM sales_invoices WHERE id=$1",
              [results[0].invoiceId],
            )
          ).rows[0],
        ).toMatchObject({
          reconciliation_status: "conciliada",
          monto_total: "10.00",
        });
      } finally {
        fixture.actualInvoice = false;
      }
    });
    it("preserves legacy table preloads and refuses to overwrite their customer or advance", async () => {
      const e = await event(),
        id = await reserve(e);
      await assigned(id, [table1.id]);
      await pool.query(
        "UPDATE restaurant_tables SET status='preloaded',event_client_name='Legacy Guest',event_advance_amount=150 WHERE id=$1",
        [table1.id],
      );
      try {
        await expect(
          service.startRestaurantEventService(id, op(), actor),
        ).rejects.toThrow("precarga");
        const saved = (
          await pool.query(
            "SELECT status,event_client_name,event_advance_amount FROM restaurant_tables WHERE id=$1",
            [table1.id],
          )
        ).rows[0];
        expect(saved).toMatchObject({
          status: "preloaded",
          event_client_name: "Legacy Guest",
          event_advance_amount: "150.00",
        });
        expect(
          (
            await pool.query(
              "SELECT order_id FROM restaurant_event_services WHERE reservation_id=$1",
              [id],
            )
          ).rows,
        ).toHaveLength(0);
      } finally {
        await pool.query(
          "UPDATE restaurant_tables SET status='available',event_client_name=NULL,event_advance_amount=NULL WHERE id=$1",
          [table1.id],
        );
        await assigned(id, []);
      }
    });
    it("keeps an overnight event open across the operational midnight boundary", async () => {
      const tomorrow = (await import("@shared/nightAuditDate")).addCalendarDays(
          today,
          1,
        ),
        e = await event({
          endTime: "02:00",
          menu: [{ menuItemId: product.id, audience: "all", quantity: 2 }],
        }),
        id = await reserve(e);
      expect((await service.restaurantEventDetail(e)).event.endDate).toBe(
        tomorrow,
      );
      await assigned(id, [table1.id]);
      const opened = await service.startRestaurantEventService(id, op(), actor);
      const included = await storage.getOrderItems(opened.orderId);
      expect(
        included.reduce((sum: number, i: any) => sum + i.quantity, 0),
      ).toBe(6);
      expect(
        included.some(
          (i: any) =>
            i.notes.startsWith("[Menú adultos") && i.unitPrice === "100.01",
        ),
      ).toBe(true);
      expect(
        included.some(
          (i: any) =>
            i.notes.startsWith("[Menú niños") && i.unitPrice === "50.00",
        ),
      ).toBe(true);
      expect(
        (
          await request(
            "DELETE",
            `/api/restaurant/orders/${opened.orderId}/items/${included[0].id}`,
            {},
          )
        ).status,
      ).toBe(409);
      await pool.query(
        `UPDATE restaurant_orders SET opened_at=now()-interval '2 days' WHERE id=$1`,
        [opened.orderId],
      );
      await storage.closeStaleOrders();
      expect((await storage.getRestaurantOrder(opened.orderId)).status).toBe(
        "open",
      );
      expect(
        (await storage.getRestaurantOrders()).some(
          (o: any) => o.id === opened.orderId,
        ),
      ).toBe(true);
      const close = await request(
        "POST",
        `/api/restaurant/orders/${opened.orderId}/close`,
        {
          paymentMethod: "efectivo",
          receiptType: "ticket",
          reservationAdvanceCredit: 0,
        },
      );
      expect(close.status, JSON.stringify(close.body)).toBe(200);
    });
    it("opens a single shared account, sends included products to kitchen, consumes stock and charges only the remainder", async () => {
      const e = await event(),
        id = await reserve(e, { adults: 5, children: 0 });
      await assigned(id, [table1.id, table2.id]);
      const a = await advance(id, "100.00"),
        b = await advance(id, "50.00");
      await service.completeEventAdvanceDocument(a.id);
      await service.completeEventAdvanceDocument(b.id);
      const result = await service.startRestaurantEventService(id, op(), actor);
      expect(
        (await service.startRestaurantEventService(id, op(), actor)).orderId,
      ).toBe(result.orderId);
      const order = await storage.getRestaurantOrder(result.orderId);
      expect(order.notes).toContain("Sin cerdo");
      expect(order.items.every((i: any) => i.notes.includes("Sin cerdo"))).toBe(
        true,
      );
      expect(
        order.items.reduce((n: number, i: any) => n + Number(i.subtotal), 0),
      ).toBeCloseTo(500.05);
      expect(order.items.reduce((n: number, i: any) => n + i.quantity, 0)).toBe(
        5,
      );
      expect(
        (await storage.getRestaurantTables())
          .filter((t: any) => [table1.id, table2.id].includes(t.id))
          .every((t: any) => t.eventServiceOrderId === result.orderId),
      ).toBe(true);
      await storage.closeStaleOrders();
      expect((await storage.getRestaurantTable(table2.id)).status).toBe(
        "occupied",
      );
      expect(
        (
          await request("POST", "/api/restaurant/orders", {
            tableId: table2.id,
            covers: 1,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(
            "POST",
            `/api/restaurant/orders/${order.id}/send-kitchen`,
            {},
          )
        ).status,
      ).toBe(200);
      expect(
        (await storage.getOrderItems(order.id)).every(
          (i: any) => i.status === "preparing" && i.sentAt,
        ),
      ).toBe(true);
      expect(
        (
          await request("POST", `/api/restaurant/orders/${order.id}/split`, {
            numberOfSplits: 2,
          })
        ).status,
      ).toBe(409);
      fixture.failInvoice = true;
      const close = await request(
        "POST",
        `/api/restaurant/orders/${order.id}/close`,
        {
          paymentMethod: "efectivo",
          receiptType: "factura_b",
          emitInvoice: true,
          reservationAdvanceCredit: 150,
          paymentSplits: [{ method: "efectivo", amount: "350.05" }],
        },
      );
      expect(close.status, JSON.stringify(close.body)).toBe(200);
      expect(close.body.total).toBe("350.05");
      expect(close.body.documentStatus).toBe("pending");
      const ordinary = await request("POST", "/api/restaurant/orders", {
        tableId: ordinaryTable.id,
        covers: 1,
        waiterName: "",
      });
      expect(ordinary.status).toBe(201);
      extraOrders.push(ordinary.body.id);
      expect(
        (
          await request(
            "POST",
            `/api/restaurant/orders/${ordinary.body.id}/close`,
            { paymentMethod: "efectivo", receiptType: "ticket" },
          )
        ).status,
      ).toBe(200);
      fixture.failInvoice = false;
      const recovered = await service.completeRestaurantEventFinalDocument(
        order.id,
      );
      expect(recovered.documentStatus).toBe("completed");
      const issued = fixture.requests.find(
        (r) => r.restaurantOrderId === order.id,
      );
      expect(
        issued.items.some(
          (i: any) =>
            i.descripcion === "Anticipos aplicados" && i.subtotal === -150,
        ),
      ).toBe(true);
      expect(
        issued.items.reduce((sum: number, i: any) => sum + i.subtotal, 0),
      ).toBeCloseTo(350.05);
      const cash = await pool.query(
        "SELECT amount FROM cash_movements WHERE source_id=$1",
        [order.id],
      );
      expect(cash.rows.map((r: any) => r.amount)).toEqual(["350.05"]);
      const folio = await storage.getFolioWithMovementsByEntity(
        "restaurant_order",
        order.id,
      );
      expect(
        folio.movements.some(
          (m: any) =>
            m.description.startsWith("Anticipos aplicados") &&
            Number(m.amount) === 150,
        ),
      ).toBe(true);
      expect(
        (
          await pool.query(
            "SELECT current_stock FROM inventory_items WHERE id=$1",
            [raw.id],
          )
        ).rows[0].current_stock,
      ).toBe("89.000");
      expect((await service.restaurantEventDetail(e)).bookings[0].status).toBe(
        "completed",
      );
      expect((await storage.getRestaurantTable(table2.id)).status).toBe(
        "available",
      );
      expect(
        (await request("POST", `/api/restaurant/orders/${order.id}/close`, {}))
          .status,
      ).toBe(409);
      expect(
        (
          await pool.query("SELECT * FROM cash_movements WHERE source_id=$1", [
            order.id,
          ])
        ).rows,
      ).toHaveLength(1);
    });

    it('rejects new legacy precargas, advances and event reservations while keeping the physical tables', async () => {
      const count = async () => Number((await pool.query('SELECT count(*) FROM restaurant_tables WHERE area_id=$1',[area.id])).rows[0].count);
      const before=await count();
      for (const data of [{status:'preloaded'},{eventClientName:'New legacy guest'},{eventAdvanceAmount:'50.00'},{eventAdvanceAmount:'-50.00'}]) {
        expect((await request('POST','/api/restaurant/tables',{tableNumber:'Rejected',areaId:area.id,capacity:4,...data})).status).toBe(409);
      }
      expect(await count()).toBe(before);
      expect((await request('PATCH','/api/restaurant/tables/'+table2.id,{status:'preloaded',eventClientName:'New guest'})).status).toBe(409);
      expect((await request('POST','/api/restaurant/orders',{tableId:table2.id,covers:2,waiterName:''})).status).toBe(409);
      expect((await request('POST','/api/restaurant/orders',{areaId:area.id,orderLabel:'New legacy event',covers:2,waiterName:''})).status).toBe(409);
      expect((await request('POST','/api/restaurant/table-reservations',{areaId:area.id,guestName:'New guest',guestPhone:'123',partySize:2,reservationDate:today,reservationTime:'21:00'})).status).toBe(409);
      expect((await request('POST','/api/restaurant/table-reservations',{tableId:table2.id,guestName:'New guest',guestPhone:'123',partySize:2,reservationDate:today,reservationTime:'21:00'})).status).toBe(409);
      expect((await storage.getRestaurantTable(table2.id)).status).toBe('available');
      const ordinary=await storage.createTableReservation({areaId:ordinaryArea.id,guestName:'Ordinary booking',guestPhone:'123',partySize:2,reservationDate:today,reservationTime:'20:00',status:'confirmed',createdAt:new Date()});reservations.push(ordinary.id);
      expect((await request('PATCH','/api/restaurant/table-reservations/'+ordinary.id,{areaId:area.id,tableId:table2.id})).status).toBe(409);
      expect((await storage.getTableReservation(ordinary.id)).areaId).toBe(ordinaryArea.id);
    });
    it('conserves the entire legacy advance and allows physical layout changes without editing the precarga', async () => {
      await pool.query("UPDATE restaurant_tables SET status='preloaded',event_client_name='Legacy owner',event_client_phone='12345',event_notes='Legacy menu',event_seats=3,event_advance_amount=150,event_advance_method='transferencia',event_advance_date='2026-11-22' WHERE id=$1",[table1.id]);
      const snapshot=async()=> (await pool.query('SELECT status,event_client_name,event_client_phone,event_notes,event_seats,event_advance_amount,event_advance_method,event_advance_date FROM restaurant_tables WHERE id=$1',[table1.id])).rows[0];
      const before=await snapshot();
      expect((await request('PATCH','/api/restaurant/tables/'+table1.id,{eventAdvanceAmount:'200.00'})).status).toBe(409);
      expect((await request('PATCH','/api/restaurant/tables/'+table1.id,{eventClientName:'Another guest'})).status).toBe(409);
      expect((await request('PATCH','/api/restaurant/tables/'+table1.id,{status:'available'})).status).toBe(409);
      expect((await request('DELETE','/api/restaurant/tables/'+table1.id)).status).toBe(409);
      expect((await request('PATCH','/api/restaurant/tables/'+table1.id,{capacity:6,eventAdvanceAmount:150})).status).toBe(200);
      expect(await snapshot()).toEqual(before);
    });
    it('starts an existing precarga once, uses its saved identity and deducts the advance only at normal closing', async () => {
      const cashBefore=Number((await pool.query('SELECT count(*) FROM cash_movements')).rows[0].count);
      const opened=await Promise.all([1,2].map(()=>request('POST','/api/restaurant/orders',{tableId:table1.id,covers:99,waiterName:'',orderLabel:'Untrusted replacement'})));
      expect(opened.map(r=>r.status).sort()).toEqual([201,409]);
      const order=opened.find(r=>r.status===201)!.body;extraOrders.push(order.id);
      expect(order).toMatchObject({covers:3,orderLabel:'Legacy owner',notes:'Legacy menu'});
      expect(Number((await pool.query('SELECT count(*) FROM cash_movements')).rows[0].count)).toBe(cashBefore);
      expect((await storage.getRestaurantTable(table1.id)).eventAdvanceAmount).toBe('150.00');
      await storage.createOrderItem({orderId:order.id,menuItemId:product.id,quantity:1,unitPrice:'200.00',subtotal:'200.00',status:'pending'});
      await storage.updateRestaurantOrder(order.id,{total:'200.00'});
      const closed=await request('POST',`/api/restaurant/orders/${order.id}/close`,{paymentMethod:'efectivo',receiptType:'ticket',reservationAdvanceCredit:150});
      expect(closed.status,JSON.stringify(closed.body)).toBe(200);
      expect(closed.body.total).toBe('50.00');
      expect((await pool.query("SELECT amount FROM cash_movements WHERE source_type='restaurant_order' AND source_id=$1",[order.id])).rows.map((r:any)=>r.amount)).toEqual(['50.00']);
      const table=await storage.getRestaurantTable(table1.id);expect(table.status).toBe('available');expect(table.eventAdvanceAmount).toBeNull();
      expect((await request('POST','/api/restaurant/orders',{tableId:table1.id,covers:3,waiterName:''})).status).toBe(409);
    });
    it('keeps existing dated reservations and all their advances usable without creating a duplicate reservation', async () => {
      const existing=await storage.createTableReservation({tableId:table2.id,areaId:area.id,guestName:'Existing reservation',guestPhone:'123',partySize:2,reservationDate:today,reservationTime:'23:00',status:'confirmed',createdAt:new Date()});reservations.push(existing.id);
      await storage.createReservationAdvance({reservationId:existing.id,amount:'75.00',paymentMethod:'transferencia',createdBy:actor});
      expect((await request('PATCH','/api/restaurant/table-reservations/'+existing.id,{status:'check_in'})).status).toBe(200);
      const opened=await request('POST','/api/restaurant/orders',{tableId:table2.id,covers:99,waiterName:'',legacyReservationId:existing.id});
      expect(opened.status,JSON.stringify(opened.body)).toBe(201);extraOrders.push(opened.body.id);
      expect(opened.body).toMatchObject({covers:2,orderLabel:'Existing reservation'});
      expect((await pool.query('SELECT amount,applied_to_order_id FROM restaurant_reservation_advances WHERE reservation_id=$1',[existing.id])).rows).toEqual([{amount:'75.00',applied_to_order_id:null}]);
      await storage.updateRestaurantOrder(opened.body.id,{status:'closed'});
    });
  },
);
