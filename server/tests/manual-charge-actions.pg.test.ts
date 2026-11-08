import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDatabaseUrl = process.env.MANUAL_CHARGE_ACTIONS_TEST_DATABASE_URL;
const databaseName = testDatabaseUrl ? new URL(testDatabaseUrl).pathname.replace(/^\//, "") : "";
if (testDatabaseUrl && !databaseName.startsWith("manual_charge_actions_test")) {
  throw new Error("MANUAL_CHARGE_ACTIONS_TEST_DATABASE_URL must point to an isolated manual_charge_actions_test database.");
}
const runIsolatedPostgresTests = testDatabaseUrl && databaseName.startsWith("manual_charge_actions_test")
  ? describe
  : describe.skip;

type Fixture = { reservationId: string; folioId: string; chargeId: string; movementId: string };
let testPool: pg.Pool;
let appPool: pg.Pool;
let reservationLookupSpy: ReturnType<typeof vi.spyOn> | undefined;
let baseUrl = "";
let httpServer: http.Server | null = null;

async function startApp() {
  const { registerReservationsRoutes } = await import("../routes/reservations");
  const { storage } = await import("../db-storage");
  reservationLookupSpy = vi.spyOn(storage, "getReservation").mockImplementation(async (id: string) => ({
    id,
    status: "checked_in",
  } as any));
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => req.header("x-test-auth") !== "false";
    req.user = {
      id: "manual-extra-test-user",
      username: req.header("x-test-user") || "manual-extra-tester",
      fullName: "Manual Extra Tester",
      role: req.header("x-test-role") || "reception",
    };
    next();
  });
  registerReservationsRoutes(app);
  httpServer = await new Promise<http.Server>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("Could not start the manual-charge test server.");
  baseUrl = `http://127.0.0.1:${address.port}`;
  const { pool } = await import("../db");
  appPool = pool;
}

async function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseBody = response.status === 204 ? null : await response.json();
  return { status: response.status, body: responseBody as any };
}

async function createFixture(input: {
  amount?: string;
  category?: string;
  recurring?: boolean;
  unitAmount?: string | null;
  status?: string;
} = {}): Promise<Fixture> {
  const reservationId = randomUUID();
  const folioId = randomUUID();
  const chargeId = randomUUID();
  const movementId = randomUUID();
  const amount = input.amount ?? "300.50";
  await testPool.query("INSERT INTO reservations (id, status) VALUES ($1, 'checked_in')", [reservationId]);
  await testPool.query(
    `INSERT INTO folios (id, entity_type, entity_id, status, total_charges, total_payments, balance)
     VALUES ($1, 'reservation', $2, 'open', $3, '0', $3)`,
    [folioId, reservationId, amount],
  );
  await testPool.query(
    `INSERT INTO charges
       (id, reservation_id, description, amount, date, category, status, is_recurring, unit_amount)
     VALUES ($1, $2, 'Cochera', $3, CURRENT_DATE, $4, $5, $6, $7)`,
    [
      chargeId,
      reservationId,
      amount,
      input.category ?? "otros",
      input.status ?? "active",
      input.recurring ?? false,
      input.unitAmount ?? null,
    ],
  );
  await testPool.query(
    `INSERT INTO folio_movements
       (id, folio_id, type, amount, description, source_type, source_id)
     VALUES ($1, $2, 'charge', $3, 'Cochera', 'charge', $4)`,
    [movementId, folioId, amount, chargeId],
  );
  return { reservationId, folioId, chargeId, movementId };
}

const bodyFor = (charge: { description?: string; amount?: string } = {}) => ({
  expectedDescription: charge.description ?? "Cochera",
  expectedAmount: charge.amount ?? "300.50",
  motivo: "Corrección solicitada por recepción",
});

runIsolatedPostgresTests("manual prefactura extras actions (isolated PostgreSQL)", () => {
  it.each([{recurring:true,unitAmount:'7500.00'},{recurring:false,unitAmount:'7500.00'}])('voids a unit-priced parking charge atomically without enabling generic editing: %j',async flags=>{
    const fixture=await createFixture({...flags,amount:'7500.00'});
    expect((await request('GET',`/api/reservations/${fixture.reservationId}/manual-charge-actions`)).body.charges[0].eligible).toBe(false);
    const response=await request('PATCH',`/api/charges/${fixture.chargeId}/anular`,{motivoAnulacion:'Cochera cargada por error'});
    expect(response.status).toBe(200);expect(response.body.status).toBe('anulado');
    const movements=(await testPool.query('SELECT type,amount::text,source_type,voided_movement_id FROM folio_movements WHERE folio_id=$1 ORDER BY amount DESC',[fixture.folioId])).rows;
    expect(movements).toHaveLength(2);
    expect(movements[1]).toMatchObject({type:'charge',amount:'-7500.00',source_type:'manual_charge_void',voided_movement_id:fixture.movementId});
    expect((await testPool.query('SELECT balance::text FROM folios WHERE id=$1',[fixture.folioId])).rows[0].balance).toBe('0.00');
    expect((await testPool.query('SELECT count(*)::int AS n FROM audit_logs WHERE entity_id=$1',[fixture.chargeId])).rows[0].n).toBe(1);
    expect((await request('PATCH',`/api/charges/${fixture.chargeId}/anular`,{motivoAnulacion:'Reintento'})).status).toBe(400);
    expect((await testPool.query('SELECT count(*)::int AS n FROM folio_movements WHERE folio_id=$1',[fixture.folioId])).rows[0].n).toBe(2);
  });
  async function restaurantFixture(legacy = false) {
    const fixture = await createFixture({ category: "restaurant" });
    const orderId = randomUUID();
    const restaurantFolioId = randomUUID();
    await testPool.query("INSERT INTO restaurant_orders VALUES ($1, 'PRUEBA', 'closed', 300.50, 'true')", [orderId]);
    await testPool.query("INSERT INTO order_items VALUES ($1, $2, 2, 'served')", [randomUUID(), orderId]);
    await testPool.query("INSERT INTO inventory_items VALUES ($1, 12)", [randomUUID()]);
    await testPool.query("INSERT INTO payments VALUES ($1, $2, 40)", [randomUUID(), fixture.reservationId]);
    await testPool.query("INSERT INTO cash_movements VALUES ($1, 40)", [randomUUID()]);
    await testPool.query(
      `INSERT INTO folios (id, entity_type, entity_id, status, total_charges, total_payments, balance)
       VALUES ($1, 'restaurant_order', $2, 'open', 300.50, 300.50, 0)`,
      [restaurantFolioId, orderId],
    );
    await testPool.query(
      `INSERT INTO folio_movements (folio_id, type, amount, description, source_type, source_id)
       VALUES ($1, 'charge', 300.50, 'Pedido PRUEBA', 'restaurant_order', $2),
              ($1, 'payment', 300.50, 'Imputación a habitación', 'restaurant_payment', $2)`,
      [restaurantFolioId, orderId],
    );
    if (legacy) {
      await testPool.query("DELETE FROM folio_movements WHERE id = $1", [fixture.movementId]);
      await testPool.query("UPDATE folios SET total_charges = 0, balance = 0 WHERE id = $1", [fixture.folioId]);
    }
    return fixture;
  }

  async function restaurantSnapshot() {
    const queries = [
      "SELECT * FROM restaurant_orders ORDER BY id",
      "SELECT * FROM order_items ORDER BY id",
      "SELECT * FROM inventory_items ORDER BY id",
      "SELECT * FROM payments ORDER BY id",
      "SELECT * FROM cash_movements ORDER BY id",
      "SELECT * FROM folios WHERE entity_type = 'restaurant_order' ORDER BY id",
      `SELECT fm.* FROM folio_movements fm JOIN folios f ON f.id = fm.folio_id
        WHERE f.entity_type = 'restaurant_order' ORDER BY fm.id`,
    ];
    return Promise.all(queries.map(async sql => (await testPool.query(sql)).rows));
  }

  async function voidRestaurant(fixture: Fixture, role = "reception", overrides: Record<string, unknown> = {}) {
    return request("PATCH", `/api/charges/${fixture.chargeId}/anular`, {
      motivoAnulacion: "Cargo que no corresponde a esta habitación",
      expectedDescription: "Cochera", expectedAmount: "300.50", ...overrides,
    }, { "x-test-role": role });
  }

  it.each(["reception", "jefe_recepcion", "admin", "manager"])(
    "%s annuls only the room imputation and preserves Restaurant, stock, payments and cash", async role => {
      const fixture = await restaurantFixture();
      const untouched = await restaurantSnapshot();
      const result = await voidRestaurant(fixture, role, { anuladoPor: "forged-actor" });
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ status: "anulado", roomOnly: true, amount: "300.50", anuladoPor: "manual-extra-tester" });
      expect(await restaurantSnapshot()).toEqual(untouched);
      const folio = await testPool.query("SELECT total_charges::text, balance::text FROM folios WHERE id = $1", [fixture.folioId]);
      expect(folio.rows[0]).toEqual({ total_charges: "0.00", balance: "0.00" });
      const reversal = await testPool.query(
        "SELECT amount::text, voided_movement_id FROM folio_movements WHERE source_type = 'restaurant_room_charge_void' AND source_id = $1",
        [fixture.chargeId],
      );
      expect(reversal.rows).toEqual([{ amount: "-300.50", voided_movement_id: fixture.movementId }]);
      const logs = await testPool.query("SELECT user_name, details FROM audit_logs WHERE entity_id = $1", [fixture.chargeId]);
      expect(logs.rows).toHaveLength(1);
      expect(logs.rows[0].user_name).toBe("manual-extra-tester");
      expect(JSON.parse(logs.rows[0].details).after).toMatchObject({ scope: "room_only", restaurantConsumptionPreserved: true });
    },
  );

  it("supports old Restaurant charges with no mirrored room ledger without inventing a movement", async () => {
    const fixture = await restaurantFixture(true);
    const untouched = await restaurantSnapshot();
    expect((await voidRestaurant(fixture, "jefe_recepcion")).status).toBe(200);
    expect(await restaurantSnapshot()).toEqual(untouched);
    expect((await testPool.query("SELECT * FROM folio_movements WHERE source_id = $1", [fixture.chargeId])).rows).toEqual([]);
  });

  it("deduplicates simultaneous annulments and later retries, retaining the first audit and reason", async () => {
    const fixture = await restaurantFixture();
    const results = await Promise.all([voidRestaurant(fixture), voidRestaurant(fixture, "jefe_recepcion")]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect((await voidRestaurant(fixture)).body.alreadyAnulado).toBe(true);
    expect((await testPool.query("SELECT count(*) FROM audit_logs WHERE entity_id = $1", [fixture.chargeId])).rows[0].count).toBe("1");
    expect((await testPool.query("SELECT count(*) FROM folio_movements WHERE source_type = 'restaurant_room_charge_void' AND source_id = $1", [fixture.chargeId])).rows[0].count).toBe("1");
  });

  it.each(["restaurant", "housekeeping", "maintenance", "responsable_area"])(
    "denies %s before any financial mutation", async role => {
      const fixture = await restaurantFixture();
      expect((await voidRestaurant(fixture, role)).status).toBe(403);
      expect((await testPool.query("SELECT status FROM charges WHERE id = $1", [fixture.chargeId])).rows[0].status).toBe("active");
    },
  );

  it.each(["borrador", "emitida", "error", "anulada"])(
    "blocks Restaurant room annulment with %s fiscal history", async state => {
      const fixture = await restaurantFixture();
      await testPool.query(
        "INSERT INTO sales_invoices (reserva_id, estado, source_charge_ids) VALUES ($1, $2, $3::jsonb)",
        [fixture.reservationId, state, JSON.stringify([fixture.chargeId])],
      );
      const result = await voidRestaurant(fixture);
      expect(result.status).toBe(409);
      expect((await testPool.query("SELECT status FROM charges WHERE id = $1", [fixture.chargeId])).rows[0].status).toBe("active");
    },
  );

  it("requires a reason and rejects stale confirmation snapshots", async () => {
    const fixture = await restaurantFixture();
    expect((await voidRestaurant(fixture, "reception", { motivoAnulacion: "  " })).status).toBe(400);
    expect((await voidRestaurant(fixture, "reception", { expectedAmount: "999.00" })).status).toBe(409);
    expect((await voidRestaurant(fixture, "reception", { expectedDescription: "Otra descripción" })).status).toBe(409);
    expect((await testPool.query("SELECT status FROM charges WHERE id = $1", [fixture.chargeId])).rows[0].status).toBe("active");
  });

  it("blocks closed rooms, closed folios and group funding scope", async () => {
    const closed = await restaurantFixture();
    await testPool.query("UPDATE reservations SET status = 'checked_out' WHERE id = $1", [closed.reservationId]);
    expect((await voidRestaurant(closed)).status).toBe(403);
    const folioClosed = await restaurantFixture();
    await testPool.query("UPDATE folios SET status = 'closed' WHERE id = $1", [folioClosed.folioId]);
    expect((await voidRestaurant(folioClosed)).status).toBe(403);
    const group = await restaurantFixture();
    await testPool.query("INSERT INTO group_reservation_links VALUES ($1, $2)", [randomUUID(), group.reservationId]);
    expect((await voidRestaurant(group)).status).toBe(409);
  });

  it("does not guess unlinked or transferred financial movements", async () => {
    const unlinked = await restaurantFixture(true);
    await testPool.query(
      "INSERT INTO folio_movements (folio_id, type, amount, description, source_type) VALUES ($1, 'charge', 300.50, 'Cochera', 'unknown')",
      [unlinked.folioId],
    );
    expect((await voidRestaurant(unlinked)).status).toBe(409);
    const transferred = await restaurantFixture();
    await testPool.query(
      "INSERT INTO charges (id, reservation_id, description, amount, date) VALUES ($1, $2, $3, 100, CURRENT_DATE)",
      [randomUUID(), randomUUID(), `[xfer:${transferred.chargeId}] Traslado`],
    );
    expect((await voidRestaurant(transferred)).status).toBe(409);
  });

  it("rolls back the charge, reversal and room balance when audit persistence fails", async () => {
    const fixture = await restaurantFixture();
    const untouched = await restaurantSnapshot();
    await testPool.query(`CREATE FUNCTION reject_room_void_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced audit failure'; END; $$;
      CREATE TRIGGER reject_room_void_audit BEFORE INSERT ON audit_logs
      FOR EACH ROW WHEN (NEW.entity_id = '${fixture.chargeId}') EXECUTE FUNCTION reject_room_void_audit();`);
    try {
      expect((await voidRestaurant(fixture)).status).toBe(500);
      expect((await testPool.query("SELECT status FROM charges WHERE id = $1", [fixture.chargeId])).rows[0].status).toBe("active");
      expect((await testPool.query("SELECT balance::text FROM folios WHERE id = $1", [fixture.folioId])).rows[0].balance).toBe("300.50");
      expect((await testPool.query("SELECT count(*) FROM folio_movements WHERE source_id = $1", [fixture.chargeId])).rows[0].count).toBe("1");
      expect(await restaurantSnapshot()).toEqual(untouched);
    } finally {
      await testPool.query("DROP TRIGGER reject_room_void_audit ON audit_logs; DROP FUNCTION reject_room_void_audit()");
    }
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl!;
    testPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 6 });
    await testPool.query(`
      DROP TABLE IF EXISTS audit_logs, sales_invoices, folio_movements, charges, folios, reservations,
        group_reservation_links, restaurant_orders, order_items, inventory_items, payments, cash_movements CASCADE;
      CREATE TABLE reservations (id varchar PRIMARY KEY, status text NOT NULL, early_check_in boolean, early_check_in_time text, early_check_in_charge numeric(10,2), late_check_out boolean, late_check_out_time text, late_check_out_charge numeric(10,2));
      CREATE SEQUENCE IF NOT EXISTS folio_seq_reservation;
      CREATE TABLE folios (
        id varchar PRIMARY KEY,
        codigo text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
        entity_type text NOT NULL,
        entity_id varchar NOT NULL,
        status text NOT NULL DEFAULT 'open',
        closed_at timestamp,
        total_charges numeric(12,2) DEFAULT 0,
        total_payments numeric(12,2) DEFAULT 0,
        balance numeric(12,2) DEFAULT 0,
        UNIQUE(entity_type,entity_id)
      );
      CREATE TABLE charges (
        id varchar PRIMARY KEY,
        reservation_id varchar NOT NULL,
        description text NOT NULL,
        amount numeric(10,2) NOT NULL,
        date date NOT NULL,
        category text NOT NULL DEFAULT 'otros',
        status text NOT NULL DEFAULT 'active',
        created_by varchar,
        is_recurring boolean NOT NULL DEFAULT false,
        unit_amount numeric(10,2),
        anulado_por text,
        motivo_anulacion text,
        anulado_at timestamp
      );
      CREATE TABLE folio_movements (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
        folio_id varchar NOT NULL,
        type text NOT NULL,
        amount numeric(12,2) NOT NULL,
        description text NOT NULL,
        source_type text,
        source_id varchar,
        voided_movement_id varchar,
        void_reason text,
        registered_by text,
        payment_method text,
        cash_movement_id varchar,
        related_folio_id varchar,
        receipt_type text,
        created_at timestamp DEFAULT NOW()
      );
      CREATE TABLE sales_invoices (
        id serial PRIMARY KEY,
        tipo_comprobante text NOT NULL DEFAULT 'FA',
        estado text,
        reserva_id varchar,
        folio_id varchar,
        source_charge_ids jsonb,
        source_charge_amounts jsonb,
        items jsonb,
        observaciones text,
        nota_credito_id integer
      );
      CREATE TABLE audit_logs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id varchar,
        user_name text,
        action text NOT NULL,
        module text NOT NULL,
        entity_type text,
        entity_id varchar,
        description text NOT NULL,
        details text,
        ip_address text,
        timestamp timestamp NOT NULL
      );
      CREATE TABLE group_reservation_links (id varchar PRIMARY KEY, reservation_id varchar NOT NULL);
      CREATE TABLE restaurant_orders (id varchar PRIMARY KEY, order_number text, status text, total numeric, charged_to_room text);
      CREATE TABLE order_items (id varchar PRIMARY KEY, order_id varchar, quantity integer, status text);
      CREATE TABLE inventory_items (id varchar PRIMARY KEY, stock numeric);
      CREATE TABLE payments (id varchar PRIMARY KEY, reservation_id varchar, amount numeric);
      CREATE TABLE cash_movements (id varchar PRIMARY KEY, amount numeric);
    `);
    await startApp();
  });

  afterAll(async () => {
    if (httpServer) {
      await new Promise<void>((resolve, reject) =>
        httpServer!.close((error) => error ? reject(error) : resolve()),
      );
    }
    reservationLookupSpy?.mockRestore();
    if (appPool) await appPool.end();
    if (testPool) await testPool.end();
  });

  it("requires the canonical role and exposes only proven manual folio origins", async () => {
    const manual = await createFixture({ category: "minibar" });
    const autoRoomCharge = await createFixture({ category: "room" });
    const recurring = await createFixture({ recurring: true });
    const unitPriced = await createFixture({ unitAmount: "75.00" });
    const unknownOrigin = await createFixture();
    await testPool.query("UPDATE folio_movements SET source_type = 'room' WHERE id = $1", [unknownOrigin.movementId]);
    const response = await request("GET", `/api/reservations/${manual.reservationId}/manual-charge-actions`);
    expect(response.status).toBe(200);
    expect(response.body.charges).toEqual([
      expect.objectContaining({ id: manual.chargeId, eligible: true, description: "Cochera", amount: "300.50", status: "active" }),
    ]);
    expect((await request("GET", `/api/reservations/${manual.reservationId}/manual-charge-actions`, undefined, { "x-test-role": "restaurant" })).status).toBe(403);
    expect((await request("GET", `/api/reservations/${manual.reservationId}/manual-charge-actions`, undefined, { "x-test-auth": "false" })).status).toBe(401);
    const ineligible = await request("GET", `/api/reservations/${autoRoomCharge.reservationId}/manual-charge-actions`);
    expect(ineligible.body.charges[0]).toMatchObject({ eligible: false });
    const recurringResponse = await request("GET", `/api/reservations/${recurring.reservationId}/manual-charge-actions`);
    expect(recurringResponse.body.charges[0]).toMatchObject({ eligible: false });
    expect((await request("GET", `/api/reservations/${unitPriced.reservationId}/manual-charge-actions`)).body.charges[0])
      .toMatchObject({ eligible: false });
    expect((await request("GET", `/api/reservations/${unknownOrigin.reservationId}/manual-charge-actions`)).body.charges[0])
      .toMatchObject({ eligible: false, reason: expect.stringContaining("origen manual único") });
  });

  it("allows Jefe de Recepción to inspect and edit charges without extending void permissions", async () => {
    const fixture = await createFixture();
    const role = { "x-test-role": "jefe_recepcion" };
    const path = `/api/reservations/${fixture.reservationId}/manual-charges/${fixture.chargeId}`;
    const actions = await request("GET", `/api/reservations/${fixture.reservationId}/manual-charge-actions`, undefined, role);
    expect(actions.status).toBe(200);
    expect(actions.body.charges[0]).toMatchObject({ id: fixture.chargeId, eligible: true });
    const changed = await request("PATCH", path, { ...bodyFor(), description: "Cochera acordada", amount: "250.00" }, role);
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ description: "Cochera acordada", amount: "250.00" });
    const movement = await testPool.query("SELECT amount::text FROM folio_movements WHERE id=$1", [fixture.movementId]);
    expect(movement.rows[0].amount).toBe("250.00");
    expect((await request("POST", path + "/anular", bodyFor(), role)).status).toBe(403);
    expect((await request("PATCH", `/api/charges/${fixture.chargeId}/anular`, { motivoAnulacion: "Corrección de prueba" }, role)).status).toBe(403);
    expect((await testPool.query("SELECT status FROM charges WHERE id=$1", [fixture.chargeId])).rows[0].status).toBe("active");
    expect((await request("PATCH", path, bodyFor(), { "x-test-role": "restaurant" })).status).toBe(403);
  });

  it("edits charge and folio atomically, validates exact input fields, and detects stale snapshots", async () => {
    const fixture = await createFixture();
    const result = await request("PATCH", `/api/reservations/${fixture.reservationId}/manual-charges/${fixture.chargeId}`, {
      ...bodyFor(),
      description: "Cochera techada",
      amount: "425.75",
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: fixture.chargeId, description: "Cochera techada", amount: "425.75", status: "active" });
    const charge = await testPool.query("SELECT description, amount::text FROM charges WHERE id = $1", [fixture.chargeId]);
    const movement = await testPool.query(
      "SELECT description, amount::text FROM folio_movements WHERE id = $1",
      [fixture.movementId],
    );
    const folio = await testPool.query("SELECT total_charges::text, balance::text FROM folios WHERE id = $1", [fixture.folioId]);
    expect(charge.rows[0]).toEqual({ description: "Cochera techada", amount: "425.75" });
    expect(movement.rows[0]).toEqual({ description: "Cochera techada", amount: "425.75" });
    expect(folio.rows[0]).toEqual({ total_charges: "425.75", balance: "425.75" });
    const audit = await testPool.query(
      "SELECT user_id, user_name, details FROM audit_logs WHERE entity_id = $1",
      [fixture.chargeId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      user_id: "manual-extra-test-user",
      user_name: "manual-extra-tester",
    });
    expect(JSON.parse(audit.rows[0].details)).toMatchObject({
      motivo: "Corrección solicitada por recepción",
      before: { charge: { amount: "300.50" }, folioMovement: { amount: "300.50" } },
      after: { charge: { amount: "425.75" }, folioMovement: { amount: "425.75" } },
    });

    const stale = await request("PATCH", `/api/reservations/${fixture.reservationId}/manual-charges/${fixture.chargeId}`, {
      ...bodyFor(),
      description: "Demasiado tarde",
      amount: "1.00",
    });
    expect(stale.status).toBe(409);
    const forged = await request("PATCH", `/api/reservations/${fixture.reservationId}/manual-charges/${fixture.chargeId}`, {
      ...bodyFor({ description: "Cochera techada", amount: "425.75" }),
      description: "Cambio",
      amount: "500",
      reservationId: randomUUID(),
    });
    expect(forged.status).toBe(400);
    const emptyMotive = await request("PATCH", `/api/reservations/${fixture.reservationId}/manual-charges/${fixture.chargeId}`, {
      ...bodyFor({ description: "Cochera techada", amount: "425.75" }),
      motivo: "   ",
      description: "Cambio",
      amount: "500",
    });
    expect(emptyMotive.status).toBe(400);
    const legacyPatch = await request("PATCH", `/api/charges/${fixture.chargeId}`, { description: "Unsafe legacy edit" });
    expect(legacyPatch.status).toBe(409);
  });

  it("anulates a fractional amount with a correctly signed ledger reversal and retains evidence", async () => {
    const fixture = await createFixture();
    const response = await request(
      "POST",
      `/api/reservations/${fixture.reservationId}/manual-charges/${fixture.chargeId}/anular`,
      bodyFor(),
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: fixture.chargeId, status: "anulado", amount: "300.50" });
    const movements = await testPool.query(
      "SELECT amount::text, source_type, voided_movement_id FROM folio_movements WHERE source_id = $1 ORDER BY created_at, id",
      [fixture.chargeId],
    );
    expect(movements.rows).toEqual([
      { amount: "300.50", source_type: "charge", voided_movement_id: null },
      { amount: "-300.50", source_type: "manual_charge_void", voided_movement_id: fixture.movementId },
    ]);
    const folio = await testPool.query("SELECT total_charges::text, balance::text FROM folios WHERE id = $1", [fixture.folioId]);
    expect(folio.rows[0]).toEqual({ total_charges: "0.00", balance: "0.00" });
    expect((await testPool.query("SELECT 1 FROM charges WHERE id = $1", [fixture.chargeId])).rowCount).toBe(1);

    const legacy = await createFixture();
    const legacyAnular = await request("PATCH", `/api/charges/${legacy.chargeId}/anular`, {
      motivoAnulacion: "Anulación heredada con razón",
    });
    expect(legacyAnular.status, JSON.stringify(legacyAnular.body)).toBe(200);
    expect(legacyAnular.body).toMatchObject({ status: "anulado", motivoAnulacion: "Anulación heredada con razón" });
    expect((await testPool.query(
      "SELECT total_charges::text, balance::text FROM folios WHERE id = $1",
      [legacy.folioId],
    )).rows[0]).toEqual({ total_charges: "0.00", balance: "0.00" });
    expect((await testPool.query(
      "SELECT count(*) FROM folio_movements WHERE source_type = 'manual_charge_void' AND source_id = $1",
      [legacy.chargeId],
    )).rows[0].count).toBe("1");
    expect((await request("PATCH", `/api/charges/${legacy.chargeId}/anular`, {
      motivoAnulacion: "Reintento de anulación",
    })).status).toBe(400);
    expect((await testPool.query(
      "SELECT count(*) FROM folio_movements WHERE source_type = 'manual_charge_void' AND source_id = $1",
      [legacy.chargeId],
    )).rows[0].count).toBe("1");
    const hardDelete = await request("DELETE", `/api/charges/${legacy.chargeId}`);
    expect(hardDelete.status).toBe(409);
    expect((await testPool.query("SELECT 1 FROM charges WHERE id = $1", [legacy.chargeId])).rowCount).toBe(1);
  });

  it.each(["emitida", "parcial", "pendiente", "error", "NC fully reconciled"])("blocks fiscal source history in state %s", async (estado) => {
    const fixture = await createFixture();
    await testPool.query(
      `INSERT INTO sales_invoices (tipo_comprobante, estado, reserva_id, folio_id, source_charge_ids, source_charge_amounts)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        estado === "NC fully reconciled" ? "NCA" : "FA",
        estado === "NC fully reconciled" ? "anulado" : estado,
        fixture.reservationId,
        fixture.folioId,
        JSON.stringify([fixture.chargeId]),
        JSON.stringify({ [fixture.chargeId]: 300.5 }),
      ],
    );
    const response = await request("PATCH", `/api/reservations/${fixture.reservationId}/manual-charges/${fixture.chargeId}`, {
      ...bodyFor(),
      description: "No modificar",
      amount: "400.00",
    });
    expect(response.status).toBe(409);
    expect(response.body.error).toContain("historial fiscal");
  });

  it("inherits note history from its mapped original invoice but fails closed for unmapped invoices", async () => {
    const unrelated = await createFixture();
    const original = await testPool.query(
      `INSERT INTO sales_invoices (tipo_comprobante, estado, reserva_id, folio_id, source_charge_ids)
       VALUES ('FA', 'emitida', $1, $2, $3) RETURNING id`,
      [unrelated.reservationId, unrelated.folioId, JSON.stringify(["other-charge-id"])],
    );
    await testPool.query(
      `INSERT INTO sales_invoices (tipo_comprobante, estado, reserva_id, folio_id, nota_credito_id)
       VALUES ('NCA', 'pendiente', $1, $2, $3)`,
      [unrelated.reservationId, unrelated.folioId, original.rows[0].id],
    );
    const unrelatedNoteActions = await request("GET", `/api/reservations/${unrelated.reservationId}/manual-charge-actions`);
    expect(unrelatedNoteActions.body.charges[0]).toMatchObject({ eligible: true });

    const unknown = await createFixture();
    await testPool.query(
      `INSERT INTO sales_invoices (tipo_comprobante, estado, reserva_id, folio_id)
       VALUES ('FA', 'failed', $1, $2)`,
      [unknown.reservationId, unknown.folioId],
    );
    const unknownActions = await request("GET", `/api/reservations/${unknown.reservationId}/manual-charge-actions`);
    expect(unknownActions.body.charges[0]).toMatchObject({ eligible: false });
    expect(unknownActions.body.charges[0].reason).toContain("no conserva el detalle");
  });

  it.each(['early_checkin','late_checkout'] as const)('edits an automatic %s without duplicating its existing room movement, including another rename', async (kind) => {
    const f = await createFixture({ amount:'42.50' });
    const early = kind === 'early_checkin', label = early ? 'Early Check-in 08:00' : 'Late Check-out 18:00';
    const prefix = early ? 'early_check_in' : 'late_check_out';
    await testPool.query(`UPDATE reservations SET ${prefix}=true,${prefix}_time=$1,${prefix}_charge='42.50' WHERE id=$2`,[early?'08:00':'18:00',f.reservationId]);
    await testPool.query('UPDATE charges SET description=$1 WHERE id=$2',[label,f.chargeId]);
    await testPool.query("UPDATE folio_movements SET source_type='room',source_id=$1,description=$2 WHERE id=$3",[f.reservationId,label+' hs',f.movementId]);
    expect((await request('GET',`/api/reservations/${f.reservationId}/manual-charge-actions`)).body.charges[0].eligible).toBe(true);
    const first=await request('PATCH',`/api/reservations/${f.reservationId}/manual-charges/${f.chargeId}`,{description:'Horario acordado',amount:'50.25',motivo:'Corrección',expectedDescription:label,expectedAmount:'42.50'});
    expect(first.status,JSON.stringify(first.body)).toBe(200);
    const second=await request('PATCH',`/api/reservations/${f.reservationId}/manual-charges/${f.chargeId}`,{description:'Horario final',amount:'60.00',motivo:'Nuevo acuerdo',expectedDescription:'Horario acordado',expectedAmount:'50.25'});
    expect(second.status,JSON.stringify(second.body)).toBe(200);
    const ledger=(await testPool.query('SELECT amount::text,description,source_type,source_id FROM folio_movements WHERE folio_id=$1',[f.folioId])).rows;
    expect(ledger).toEqual([{amount:'60.00',description:'Horario final',source_type:kind,source_id:f.chargeId}]);
    expect((await testPool.query(`SELECT ${prefix}_charge::text AS amount FROM reservations WHERE id=$1`,[f.reservationId])).rows[0].amount).toBe('60.00');
  });
  it.each([false,true])('links an unposted automatic late charge on edit (missing folio: %s)', async (missingFolio) => {
    const f=await createFixture({amount:'42.50'});
    await testPool.query("UPDATE reservations SET late_check_out=true,late_check_out_time=NULL,late_check_out_charge='42.50' WHERE id=$1",[f.reservationId]);
    await testPool.query("UPDATE charges SET description='Late Check-out' WHERE id=$1",[f.chargeId]);
    await testPool.query('DELETE FROM folio_movements WHERE id=$1',[f.movementId]);
    if (missingFolio) await testPool.query('DELETE FROM folios WHERE id=$1',[f.folioId]);
    const actions=await request('GET',`/api/reservations/${f.reservationId}/manual-charge-actions`);
    expect(actions.body.charges[0].eligible).toBe(true);
    expect((await testPool.query('SELECT count(*)::int AS n FROM folio_movements WHERE folio_id=$1',[f.folioId])).rows[0].n).toBe(0);
    const edited=await request('PATCH',`/api/reservations/${f.reservationId}/manual-charges/${f.chargeId}`,{description:'Salida especial',amount:'45.00',motivo:'Corrección',expectedDescription:'Late Check-out',expectedAmount:'42.50'});
    expect(edited.status,JSON.stringify(edited.body)).toBe(200);
    const folio=(await testPool.query("SELECT id,codigo FROM folios WHERE entity_type='reservation' AND entity_id=$1",[f.reservationId])).rows[0];
    if (missingFolio) expect(folio.codigo).toMatch(/^RS-\d+$/);
    expect((await testPool.query('SELECT amount::text,source_type FROM folio_movements WHERE folio_id=$1',[folio.id])).rows).toEqual([{amount:'45.00',source_type:'late_checkout'}]);
  });
  it("returns 404 across reservations, 403 for closed/no-show/closed folios, and prevents legacy hard deletion", async () => {
    const owner = await createFixture();
    const other = await createFixture();
    const crossReservation = await request(
      "PATCH",
      `/api/reservations/${other.reservationId}/manual-charges/${owner.chargeId}`,
      { ...bodyFor(), description: "No", amount: "1" },
    );
    expect(crossReservation.status).toBe(404);

    await testPool.query("UPDATE reservations SET status = 'no_show' WHERE id = $1", [owner.reservationId]);
    expect((await request("PATCH", `/api/reservations/${owner.reservationId}/manual-charges/${owner.chargeId}`, {
      ...bodyFor(),
      description: "No",
      amount: "1",
    })).status).toBe(403);

    const closed = await createFixture();
    await testPool.query("UPDATE folios SET status = 'invoiced' WHERE id = $1", [closed.folioId]);
    expect((await request("POST", `/api/reservations/${closed.reservationId}/manual-charges/${closed.chargeId}/anular`, bodyFor())).status).toBe(403);

    const deleteResponse = await request("DELETE", `/api/charges/${other.chargeId}`);
    expect(deleteResponse.status, JSON.stringify(deleteResponse.body)).toBe(409);
    expect((await testPool.query("SELECT 1 FROM charges WHERE id = $1", [other.chargeId])).rowCount).toBe(1);
  });

  it("rolls back charge and folio updates when the required audit insert fails", async () => {
    const fixture = await createFixture();
    await testPool.query(`
      CREATE OR REPLACE FUNCTION fail_manual_action_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.user_name = 'audit-fail-user' THEN RAISE EXCEPTION 'injected audit failure'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_manual_action_audit_trigger
      BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_manual_action_audit();
    `);
    const response = await request(
      "PATCH",
      `/api/reservations/${fixture.reservationId}/manual-charges/${fixture.chargeId}`,
      { ...bodyFor(), description: "Rollback", amount: "500.00" },
      { "x-test-user": "audit-fail-user" },
    );
    expect(response.status).toBe(500);
    expect((await testPool.query("SELECT description, amount::text FROM charges WHERE id = $1", [fixture.chargeId])).rows[0])
      .toEqual({ description: "Cochera", amount: "300.50" });
    expect((await testPool.query("SELECT amount::text FROM folio_movements WHERE id = $1", [fixture.movementId])).rows[0].amount)
      .toBe("300.50");
    await testPool.query("DROP TRIGGER fail_manual_action_audit_trigger ON audit_logs");
    await testPool.query("DROP FUNCTION fail_manual_action_audit()");
  });

  it("rechecks invoice history after waiting for the invoice advisory lock", async () => {
    const fixture = await createFixture();
    const lockClient = await testPool.connect();
    try {
      await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [`folio-invoice:${fixture.reservationId}`]);
      const pendingRequest = request(
        "PATCH",
        `/api/reservations/${fixture.reservationId}/manual-charges/${fixture.chargeId}`,
        { ...bodyFor(), description: "Raced edit", amount: "400.00" },
      );
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (Date.now() < deadline) {
        const result = await testPool.query(
          `SELECT count(*)::int AS count
             FROM pg_stat_activity
            WHERE wait_event_type = 'Lock'
              AND query LIKE '%pg_advisory_lock%'
              AND pid <> pg_backend_pid()`,
        );
        if (result.rows[0].count > 0) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
      await testPool.query(
        `INSERT INTO sales_invoices (tipo_comprobante, estado, reserva_id, folio_id, source_charge_ids)
         VALUES ('FA', 'pendiente', $1, $2, $3)`,
        [fixture.reservationId, fixture.folioId, JSON.stringify([fixture.chargeId])],
      );
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [`folio-invoice:${fixture.reservationId}`]);
      const response = await pendingRequest;
      expect(response.status).toBe(409);
      expect(response.body.error).toContain("historial fiscal");
      expect((await testPool.query("SELECT description FROM charges WHERE id = $1", [fixture.chargeId])).rows[0].description)
        .toBe("Cochera");
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [`folio-invoice:${fixture.reservationId}`]).catch(() => undefined);
      lockClient.release();
    }
  });
});
