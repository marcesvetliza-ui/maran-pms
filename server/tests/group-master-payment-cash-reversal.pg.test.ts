import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyFinancialSchema } from "../migrate";

/**
 * End-to-end Postgres companion to group-master-payment-cash-reversal.test.ts
 * (task #411's in-memory-mocked unit test). That suite proves the DELETE
 * handler's cash_movements update *logic* against a fake db/tx. This suite
 * proves the real flow: POST a Pago Grupal/Folio Maestro payment through the
 * production route (which calls registerGroupPaymentCashMovements and really
 * inserts into cash_movements), confirm that row exists with anulado=false,
 * then DELETE the payment and confirm that same row flips to anulado=true in
 * PostgreSQL — otherwise Caja/Reportes would keep showing income for a
 * payment that no longer exists.
 */

vi.mock("../auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { username: "cajera-pg-tester" };
    next();
  },
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;

type Fixture = {
  groupId: string;
  groupChargeId: string;
};

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
    groupId: `pg-cash-reversal-group-${suffix}`,
    groupChargeId: `pg-cash-reversal-charge-${suffix}`,
  };

  await testPool.query(
    `INSERT INTO groups
      (id, group_code, name, check_in_date, check_out_date, status, master_folio_config, created_at)
     VALUES ($1, $2, $3, DATE '2026-08-26', DATE '2026-08-27', 'confirmed', 'accommodation', NOW())`,
    [fixture.groupId, `PGCASH-${suffix}`, "Prueba de anulación de caja en Folio Maestro"],
  );
  // A group_charges row (rather than a real reservation) gives the master
  // folio a balance without needing rooms/guests — the master-payment route
  // allocates non-room-tied receipts to "__group_charges__" and skips
  // creating any reservation payment, exactly like a Folio Maestro receipt
  // that only covers group-level charges.
  await testPool.query(
    `INSERT INTO group_charges (id, group_id, description, amount, date, category, billing_target)
     VALUES ($1, $2, 'Cargo de grupo de prueba', '150.00', DATE '2026-08-26', 'otros', 'group')`,
    [fixture.groupChargeId, fixture.groupId],
  );

  return fixture;
}

async function cleanupFixture(fixture: Fixture, groupPaymentId: string | null) {
  if (!testPool) return;
  if (groupPaymentId) {
    await testPool.query("DELETE FROM cash_movements WHERE payment_id = $1", [groupPaymentId]);
    await testPool.query("DELETE FROM payments WHERE group_payment_id = $1", [groupPaymentId]);
    await testPool.query("DELETE FROM group_payments WHERE id = $1", [groupPaymentId]);
  }
  await testPool.query("DELETE FROM group_charges WHERE id = $1", [fixture.groupChargeId]);
  await testPool.query("DELETE FROM groups WHERE id = $1", [fixture.groupId]);
}

async function postMasterPayment(fixture: Fixture) {
  const response = await fetch(`${baseUrl}/api/groups/${fixture.groupId}/master-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      receiptType: "none",
      receiverDetails: { razonSocial: "Empresa Receptora SA", cuit: "30712345678" },
      concepts: [{ description: "Anticipo Folio Maestro PostgreSQL", amount: 150 }],
      paymentRows: [{ method: "efectivo", amount: "150.00", reference: "REC-PG-MASTER-001" }],
      date: "2026-08-26",
      reference: "Pago Folio Maestro — prueba PostgreSQL",
    }),
  });
  return { status: response.status, body: await response.json() as any };
}

async function deleteMasterPayment(groupId: string, paymentId: string) {
  const response = await fetch(`${baseUrl}/api/groups/${groupId}/master-payments/${paymentId}`, {
    method: "DELETE",
  });
  return { status: response.status, body: await response.json() as any };
}

async function readCashMovements(groupPaymentId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query(
    `SELECT payment_id, source_type, source_id, payment_method, amount, movement_type,
            anulado, anulado_por, anulado_at, motivo_anulacion
     FROM cash_movements
     WHERE payment_id = $1`,
    [groupPaymentId],
  );
  return result.rows;
}

async function readGroupPayment(groupPaymentId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query("SELECT id FROM group_payments WHERE id = $1", [groupPaymentId]);
  return result.rows;
}

async function readGroupPaymentsForGroup(groupId: string) {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const result = await testPool.query("SELECT id FROM group_payments WHERE group_id = $1", [groupId]);
  return result.rows;
}

runIfDatabaseIsConfigured("PostgreSQL real: Caja stops showing income when a group master payment is reversed", () => {
  beforeAll(async () => {
    if (!testPool) return;
    const financialSchema = await verifyFinancialSchema();
    expect(
      financialSchema,
      "La base de datos debe tener todas las columnas e índices requeridos por cobros maestros y Caja.",
    ).toMatchObject({
      ready: true,
      missingColumns: [],
      missingIndexes: [],
    });
    await startApp();
  });

  afterAll(async () => {
    await stopApp();
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
  });

  it("records a real cash_movements income row for a Pago Folio Maestro and anulas it end-to-end on reversal", async () => {
    const fixture = await createFixture();
    let groupPaymentId: string | null = null;
    try {
      const posted = await postMasterPayment(fixture);
      expect(posted.status).toBe(200);
      expect(posted.body.success).toBe(true);
      groupPaymentId = posted.body.groupPaymentId;
      expect(groupPaymentId).toBeTruthy();

      const [groupPaymentRow] = await readGroupPayment(groupPaymentId!);
      expect(groupPaymentRow).toMatchObject({ id: groupPaymentId });

      const beforeDelete = await readCashMovements(groupPaymentId!);
      expect(beforeDelete).toHaveLength(1);
      expect(beforeDelete[0]).toMatchObject({
        payment_id: groupPaymentId,
        source_type: "group_payment",
        source_id: fixture.groupId,
        payment_method: "efectivo",
        amount: "150.00",
        movement_type: "income",
        anulado: false,
        anulado_por: null,
        anulado_at: null,
      });

      const deleted = await deleteMasterPayment(fixture.groupId, groupPaymentId!);
      expect(deleted.status).toBe(200);
      expect(deleted.body.success).toBe(true);

      const groupPaymentAfterDelete = await readGroupPayment(groupPaymentId!);
      expect(groupPaymentAfterDelete).toEqual([]);

      const afterDelete = await readCashMovements(groupPaymentId!);
      expect(afterDelete).toHaveLength(1);
      expect(afterDelete[0]).toMatchObject({
        payment_id: groupPaymentId,
        amount: "150.00",
        anulado: true,
        anulado_por: "cajera-pg-tester",
      });
      expect(afterDelete[0].anulado_at).toBeInstanceOf(Date);
      expect(typeof afterDelete[0].motivo_anulacion).toBe("string");
      expect(afterDelete[0].motivo_anulacion.length).toBeGreaterThan(0);
    } finally {
      await cleanupFixture(fixture, groupPaymentId);
    }
  }, 15_000);

  it("rejects a room breakdown for a master-folio receipt before persisting the group payment", async () => {
    const fixture = await createFixture();
    try {
      const { storage } = await import("../db-storage");

      await expect(storage.recordGroupPayment({
        groupId: fixture.groupId,
        destination: "master_folio",
        paymentRows: [{ method: "efectivo", amount: "150.00", reference: "PG-MASTER-INVALID-BREAKDOWN" }],
        date: "2026-08-26",
        reference: "Desglose inválido de Folio Maestro",
        distribution: "master_folio",
        distributionDetail: { __group_charges__: 150 },
        concepts: [
          { description: "Habitación 101", amount: 75 },
          { description: "Habitación 102", amount: 75 },
        ],
      })).rejects.toThrow(/único concepto global/i);

      expect(await readGroupPaymentsForGroup(fixture.groupId)).toEqual([]);
    } finally {
      await cleanupFixture(fixture, null);
    }
  }, 15_000);
});
