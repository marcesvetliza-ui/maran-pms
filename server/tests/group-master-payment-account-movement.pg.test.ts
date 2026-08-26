import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyFinancialSchema } from "../migrate";

/**
 * This suite intentionally does not mock db-storage or db. It exercises the
 * production transaction paths against PostgreSQL, using separate pooled
 * connections for the reversal and the current-account allocation.
 *
 * The regular group-master-payment test covers the same race with an in-memory
 * lock. This test covers PostgreSQL's real row-lock queue and FK enforcement.
 */

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;

type Fixture = {
  groupId: string;
  groupPaymentId: string;
  cargoId: string;
  paymentId: string;
  entityId: string;
};

type OperationResult =
  | { kind: "allocation"; status: "fulfilled"; value: unknown }
  | { kind: "allocation"; status: "rejected"; error: unknown }
  | { kind: "reversal"; status: "fulfilled"; value: { status: number; body: any } }
  | { kind: "reversal"; status: "rejected"; error: unknown };

const testPool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
    })
  : null;

let baseUrl = "";
let httpServer: http.Server | null = null;
let storage: Awaited<typeof import("../db-storage")>["storage"];

async function startApp() {
  const { registerGroupsRoutes } = await import("../routes/groups");
  const app = express();
  app.use(express.json());
  registerGroupsRoutes(app);

  httpServer = await new Promise<http.Server>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("No se pudo obtener el puerto del servidor de prueba");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopApp() {
  if (!httpServer) return;
  await new Promise<void>((resolve, reject) => {
    httpServer!.close((error) => (error ? reject(error) : resolve()));
  });
  httpServer = null;
}

async function createFixture(): Promise<Fixture> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");

  const suffix = randomUUID();
  const fixture: Fixture = {
    groupId: `pg-concurrency-group-${suffix}`,
    groupPaymentId: `pg-concurrency-payment-${suffix}`,
    cargoId: `pg-concurrency-cargo-${suffix}`,
    paymentId: `pg-concurrency-room-payment-${suffix}`,
    entityId: `pg-concurrency-company-${suffix}`,
  };

  await testPool.query("BEGIN");
  try {
    await testPool.query(
      `INSERT INTO groups
        (id, group_code, name, check_in_date, check_out_date, status, created_at)
       VALUES ($1, $2, $3, DATE '2026-08-26', DATE '2026-08-27', 'confirmed', NOW())`,
      [fixture.groupId, `PG-${suffix}`, "Prueba de concurrencia PostgreSQL"],
    );
    await testPool.query(
      `INSERT INTO group_payments
        (id, group_id, amount, method, date, reference, distribution)
       VALUES ($1, $2, '100.00', 'cuenta_corriente', DATE '2026-08-26', $3, 'master_folio')`,
      [fixture.groupPaymentId, fixture.groupId, `fixture-${suffix}`],
    );
    await testPool.query(
      `INSERT INTO payments
        (id, reservation_id, amount, method, date, reference, status, group_payment_id)
       VALUES ($1, $2, '100.00', 'cuenta_corriente', DATE '2026-08-26', $3, 'active', $4)`,
      [fixture.paymentId, `reservation-${suffix}`, `fixture-${suffix}`, fixture.groupPaymentId],
    );
    await testPool.query(
      `INSERT INTO account_movements
        (id, entity_type, entity_id, date, type, description, amount,
         reference, payment_method, group_payment_id)
       VALUES ($1, 'company', $2, DATE '2026-08-26', 'cargo',
               'Cargo maestro de prueba', '100.00', $3, 'cuenta_corriente', $4)`,
      [fixture.cargoId, fixture.entityId, `fixture-${suffix}`, fixture.groupPaymentId],
    );
    await testPool.query("COMMIT");
  } catch (error) {
    await testPool.query("ROLLBACK");
    throw error;
  }

  return fixture;
}

async function cleanupFixture(fixture: Fixture) {
  if (!testPool) return;
  await testPool.query("DELETE FROM account_movement_allocations WHERE cargo_id = $1 OR pago_id = $1", [fixture.cargoId]);
  await testPool.query(
    `DELETE FROM account_movements
     WHERE id = $1 OR group_payment_id = $2 OR (entity_type = 'company' AND entity_id = $3)`,
    [
    fixture.cargoId,
      fixture.groupPaymentId,
      fixture.entityId,
    ],
  );
  await testPool.query("DELETE FROM payments WHERE id = $1", [fixture.paymentId]);
  await testPool.query("DELETE FROM group_payments WHERE id = $1", [fixture.groupPaymentId]);
  await testPool.query("DELETE FROM groups WHERE id = $1", [fixture.groupId]);
}

async function waitForBlockedTransactions(expected: number) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const deadline = Date.now() + 3_000;

  while (Date.now() < deadline) {
    const result = await testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND pid <> pg_backend_pid()
         AND wait_event_type = 'Lock'`,
    );
    if (Number(result.rows[0]?.count || 0) >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const activity = await testPool.query<{
    pid: number;
    state: string;
    wait_event_type: string | null;
    query: string;
  }>(
    `SELECT pid, state, wait_event_type, LEFT(query, 220) AS query
     FROM pg_stat_activity
     WHERE datname = current_database()
       AND pid <> pg_backend_pid()
     ORDER BY pid`,
  );
  throw new Error(
    `Las transacciones no llegaron al bloqueo esperado (${expected}): ${JSON.stringify(activity.rows)}`,
  );
}

async function beginHoldingCargo(fixture: Fixture) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const client = await testPool.connect();
  await client.query("BEGIN");
  await client.query("SELECT id FROM account_movements WHERE id = $1 FOR UPDATE", [fixture.cargoId]);
  return client;
}

async function allocateCargo(fixture: Fixture): Promise<OperationResult> {
  try {
    const result = await storage.createPaymentWithAllocations(
      "company",
      fixture.entityId,
      {
        date: "2026-08-26",
        description: "Imputación concurrente PostgreSQL",
        amount: "-100.00",
        reference: null,
        paymentMethod: "transferencia",
        retentions: null,
        createdBy: null,
      },
      [{ cargoId: fixture.cargoId, amount: "100.00" }],
    );
    return { kind: "allocation", status: "fulfilled", value: result };
  } catch (error) {
    return { kind: "allocation", status: "rejected", error };
  }
}

async function reverseMasterPayment(fixture: Fixture): Promise<OperationResult> {
  try {
    const response = await fetch(
      `${baseUrl}/api/groups/${fixture.groupId}/master-payments/${fixture.groupPaymentId}`,
      { method: "DELETE" },
    );
    return {
      kind: "reversal",
      status: "fulfilled",
      value: { status: response.status, body: await response.json() },
    };
  } catch (error) {
    return { kind: "reversal", status: "rejected", error };
  }
}

async function runScenario(winner: "allocation" | "reversal") {
  const fixture = await createFixture();
  const holder = await beginHoldingCargo(fixture);
  const pending: Promise<OperationResult>[] = [];

  try {
    const first = winner === "allocation"
      ? allocateCargo(fixture)
      : reverseMasterPayment(fixture);
    pending.push(first);
    await waitForBlockedTransactions(1);

    const second = winner === "allocation"
      ? reverseMasterPayment(fixture)
      : allocateCargo(fixture);
    pending.push(second);
    await waitForBlockedTransactions(2);

    await holder.query("COMMIT");
    const results = await Promise.all([first, second]);
    return { fixture, results };
  } catch (error) {
    await holder.query("ROLLBACK").catch(() => undefined);
    await Promise.allSettled(pending);
    await cleanupFixture(fixture);
    throw error;
  } finally {
    holder.release();
  }
}

async function readLedgerState(fixture: Fixture) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const [groupPayment, cargo, allocations, paymentsForGroup, paymentMovements] = await Promise.all([
    testPool.query("SELECT id FROM group_payments WHERE id = $1", [fixture.groupPaymentId]),
    testPool.query("SELECT id FROM account_movements WHERE id = $1", [fixture.cargoId]),
    testPool.query(
      "SELECT pago_id, cargo_id, amount FROM account_movement_allocations WHERE cargo_id = $1",
      [fixture.cargoId],
    ),
    testPool.query("SELECT id FROM payments WHERE group_payment_id = $1", [fixture.groupPaymentId]),
    testPool.query(
      `SELECT id, type, amount
       FROM account_movements
       WHERE entity_type = 'company' AND entity_id = $1 AND type = 'pago'`,
      [fixture.entityId],
    ),
  ]);
  return {
    groupPayment: groupPayment.rows,
    cargo: cargo.rows,
    allocations: allocations.rows,
    paymentsForGroup: paymentsForGroup.rows,
    paymentMovements: paymentMovements.rows,
  };
}

function assertAllocationWon(results: OperationResult[]) {
  expect(results.filter((result) => result.kind === "allocation" && result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.kind === "reversal" && result.status === "fulfilled")).toHaveLength(1);
  const reversal = results.find((result) => result.kind === "reversal") as Extract<OperationResult, { kind: "reversal" }>;
  expect(reversal.status).toBe("fulfilled");
  if (reversal.status === "fulfilled") expect(reversal.value.status).toBe(409);
}

function assertReversalWon(results: OperationResult[]) {
  expect(results.filter((result) => result.kind === "reversal" && result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.kind === "allocation" && result.status === "rejected")).toHaveLength(1);
  const reversal = results.find((result) => result.kind === "reversal") as Extract<OperationResult, { kind: "reversal" }>;
  expect(reversal.status).toBe("fulfilled");
  if (reversal.status === "fulfilled") expect(reversal.value.status).toBe(200);
}

runIfDatabaseIsConfigured("PostgreSQL real: master payment reversal vs current-account allocation", () => {
  beforeAll(async () => {
    if (!testPool) return;
    ({ storage } = await import("../db-storage"));
    const financialSchema = await verifyFinancialSchema();
    expect(
      financialSchema,
      "La base de datos debe tener todas las columnas e índices requeridos por cobros maestros y Cuenta Corriente.",
    ).toMatchObject({
      ready: true,
      missingColumns: [],
      missingIndexes: [],
    });
    const requiredColumns = await testPool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'account_movements' AND column_name = 'group_payment_id')
           OR (table_name = 'group_payments' AND column_name = 'id')
           OR (table_name = 'account_movement_allocations' AND column_name IN ('cargo_id', 'pago_id'))
         )`,
    );
    const availableColumns = new Set(
      requiredColumns.rows.map((column) => `${column.table_name}.${column.column_name}`),
    );
    const missingColumns = [
      "account_movements.group_payment_id",
      "group_payments.id",
      "account_movement_allocations.cargo_id",
      "account_movement_allocations.pago_id",
    ].filter((column) => !availableColumns.has(column));
    expect(
      missingColumns,
      "La base de datos de pruebas debe tener las migraciones aplicadas antes de ejecutar esta suite.",
    ).toEqual([]);

    const allocationForeignKeys = await testPool.query<{
      column_name: string;
      referenced_table: string;
    }>(
      `SELECT source_column.attname AS column_name, referenced_table.relname AS referenced_table
       FROM pg_constraint fk_constraint
       JOIN pg_class source_table ON source_table.oid = fk_constraint.conrelid
       JOIN pg_class referenced_table ON referenced_table.oid = fk_constraint.confrelid
       JOIN unnest(fk_constraint.conkey) WITH ORDINALITY AS source_keys(attnum, position) ON TRUE
       JOIN pg_attribute source_column
         ON source_column.attrelid = source_table.oid AND source_column.attnum = source_keys.attnum
       WHERE fk_constraint.contype = 'f'
         AND source_table.relname = 'account_movement_allocations'
       ORDER BY source_column.attname`,
    );
    expect(allocationForeignKeys.rows).toEqual([
      { column_name: "cargo_id", referenced_table: "account_movements" },
      { column_name: "pago_id", referenced_table: "account_movements" },
    ]);
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  it("has every required column and index for master payments and Cuenta Corriente", async () => {
    const financialSchema = await verifyFinancialSchema();
    expect(financialSchema).toEqual({
      ready: true,
      missingColumns: [],
      missingIndexes: [],
    });
  });

  it("keeps the ledger consistent when allocation is queued behind reversal", async () => {
    const { fixture, results } = await runScenario("reversal");
    try {
      assertReversalWon(results);
      const state = await readLedgerState(fixture);
      expect(state.groupPayment).toEqual([]);
      expect(state.cargo).toEqual([]);
      expect(state.allocations).toEqual([]);
      expect(state.paymentsForGroup).toEqual([]);
      expect(state.paymentMovements).toEqual([]);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);

  it("keeps the ledger consistent when reversal is queued behind allocation", async () => {
    const { fixture, results } = await runScenario("allocation");
    try {
      assertAllocationWon(results);
      const state = await readLedgerState(fixture);
      expect(state.groupPayment).toHaveLength(1);
      expect(state.cargo).toHaveLength(1);
      expect(state.allocations).toHaveLength(1);
      expect(state.allocations[0]).toMatchObject({
        cargo_id: fixture.cargoId,
        amount: "100.00",
      });
      expect(state.paymentsForGroup).toEqual([{ id: fixture.paymentId }]);
      expect(state.paymentMovements).toHaveLength(1);
      expect(state.paymentMovements[0]).toMatchObject({
        type: "pago",
        amount: "-100.00",
      });
    } finally {
      await cleanupFixture(fixture);
    }
  }, 15_000);
});