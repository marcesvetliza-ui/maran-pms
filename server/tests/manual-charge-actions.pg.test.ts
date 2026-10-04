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
  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl!;
    testPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 6 });
    await testPool.query(`
      DROP TABLE IF EXISTS audit_logs, sales_invoices, folio_movements, charges, folios, reservations CASCADE;
      CREATE TABLE reservations (id varchar PRIMARY KEY, status text NOT NULL);
      CREATE TABLE folios (
        id varchar PRIMARY KEY,
        entity_type text NOT NULL,
        entity_id varchar NOT NULL,
        status text NOT NULL DEFAULT 'open',
        closed_at timestamp,
        total_charges numeric(12,2) DEFAULT 0,
        total_payments numeric(12,2) DEFAULT 0,
        balance numeric(12,2) DEFAULT 0
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