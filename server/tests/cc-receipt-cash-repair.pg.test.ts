import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const explicitPgTestOptIn = process.env.RUN_CC_RECEIPT_CASH_REPAIR_PG_TESTS === "1";
const databaseName = (() => {
  if (!process.env.DATABASE_URL) return null;
  try {
    return decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ""));
  } catch {
    if (explicitPgTestOptIn) throw new Error("DATABASE_URL no es válida para las pruebas de reparación CC.");
    return null;
  }
})();
const disposableDatabaseName = Boolean(
  databaseName &&
  (databaseName === "maran_test" || /(^|[_-])(test|testing|ci)([_-]|$)/i.test(databaseName)),
);
if (explicitPgTestOptIn && !disposableDatabaseName) {
  throw new Error("Las pruebas PG de reparación CC requieren una base con nombre desechable; se rechazó DATABASE_URL.");
}
const isCi = /^(1|true)$/i.test(process.env.CI || "");
const runCcReceiptRepairPgTests = Boolean(
  process.env.DATABASE_URL && disposableDatabaseName && (explicitPgTestOptIn || isCi),
);
const runIfSafeDisposableDatabase = runCcReceiptRepairPgTests ? describe : describe.skip;
const testPool = runCcReceiptRepairPgTests
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000 })
  : null;

type Fixture = {
  receiptId: string;
  sourceShiftId: string;
  targetShiftId: string;
  cashIds: string[];
  receiptNumber: string;
  paymentIds: string[];
  groupPaymentIds: string[];
  groupIds: string[];
};

let role = "admin";
let authenticated = true;
let fixtureOrdinal = 0;

async function startRoute() {
  const { registerCcReceiptCashRepairRoutes } = await import("../routes/cc-receipt-cash-repair");
  const app = express();
  app.use(express.json());
  // Provide a test identity while retaining the actual requireAuth and
  // requireRole middleware installed by the route module.
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => authenticated;
    req.user = { id: "repair-test-user", fullName: "Repair Test", username: "repair-test", role };
    next();
  });
  registerCcReceiptCashRepairRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function request(baseUrl: string, path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  return { status: response.status, body: await response.json() as any };
}

async function waitForRepairLockWait(queryPattern: string) {
  if (!testPool) throw new Error("No está habilitado el PostgreSQL desechable de estas pruebas.");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const waiting = await testPool.query(
      `SELECT COUNT(*)::integer AS count
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND wait_event_type = 'Lock'
         AND query ILIKE $1`,
      [queryPattern],
    );
    if (waiting.rows[0].count > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`El endpoint no quedó esperando el bloqueo PostgreSQL esperado: ${queryPattern}`);
}

function fixtureIds() {
  return {
    receiptId: randomUUID(),
    sourceShiftId: randomUUID(),
    targetShiftId: randomUUID(),
    cashIds: [randomUUID(), randomUUID()],
    receiptNumber: `REC-2098-${randomUUID().slice(0, 8)}`,
  };
}

async function createFixture(options: {
  receiptCreatedAt?: string;
  sourceStatus?: string;
  targetStatus?: string;
  targetOpenedAt?: string;
  receiptVoided?: boolean;
  reservationId?: string | null;
  rowArea?: string;
  secondRowArea?: string;
  cashPaymentId?: string | null;
  cashAnnulled?: boolean;
  linkedMovement?: "payment" | "group";
  includeRetention?: boolean;
} = {}): Promise<Fixture> {
  if (!testPool) throw new Error("DATABASE_URL no está configurado");
  const ids = fixtureIds();
  const paymentIds = options.linkedMovement === "payment" ? [randomUUID()] : [];
  const groupPaymentIds = options.linkedMovement === "group" ? [randomUUID()] : [];
  const groupIds = options.linkedMovement === "group" ? [randomUUID()] : [];
  const targetOpenedAt = options.targetOpenedAt ?? `2199-01-01 12:00:${String(++fixtureOrdinal).padStart(2, "0")}`;
  const receiptCreatedAt = options.receiptCreatedAt ?? "2199-01-01 15:00:00";
  try {
    await testPool.query(
      `INSERT INTO cash_shifts (id, area, shift_number, opened_at, status)
       VALUES ($1, 'recepcion', 1, '2199-01-01 11:00:00', $2),
              ($3, 'reception', 2, $4, $5)`,
      [
        ids.sourceShiftId,
        options.sourceStatus ?? "open",
        ids.targetShiftId,
        targetOpenedAt,
        options.targetStatus ?? "open",
      ],
    );
    if (paymentIds.length) {
      await testPool.query(
        `INSERT INTO payments (id, reservation_id, amount, method, date)
         VALUES ($1, $2, '100.00', 'transferencia', '2199-01-01')`,
        [paymentIds[0], `reservation-${paymentIds[0]}`],
      );
    }
    if (groupPaymentIds.length) {
      await testPool.query(
        `INSERT INTO groups (id, group_code, name, check_in_date, check_out_date, created_at)
         VALUES ($1, $2, 'Repair test group', '2199-01-01', '2199-01-02', NOW())`,
        [groupIds[0], `CC-REPAIR-${groupIds[0]}`],
      );
      await testPool.query(
        `INSERT INTO group_payments (id, group_id, amount, method, date)
         VALUES ($1, $2, '100.00', 'transferencia', '2199-01-01')`,
        [groupPaymentIds[0], groupIds[0]],
      );
    }
    await testPool.query(
      `INSERT INTO account_movements
         (id, entity_type, entity_id, date, type, description, amount, reservation_id,
          retentions, created_at, receipt_number, voided, payment_id, group_payment_id)
       VALUES ($1, 'company', $2, '2199-01-01', 'pago', 'Recibo de prueba', '-100.00',
         $3, $4::jsonb, $5, $9, $6, $7, $8)`,
      [
        ids.receiptId,
        `company-${ids.receiptId}`,
        options.reservationId ?? null,
        options.includeRetention === false ? null : JSON.stringify([{ concepto: "IIBB", monto: "20.00" }]),
        receiptCreatedAt,
        options.receiptVoided ?? false,
        paymentIds[0] ?? null,
        groupPaymentIds[0] ?? null,
        ids.receiptNumber,
      ],
    );
    await testPool.query(
      `INSERT INTO cash_movements
         (id, shift_id, area, source_type, source_id, payment_method, amount,
          movement_type, created_at, anulado, payment_id, registered_by)
       VALUES ($1, $2, $3, 'recibo_cta_cte', $4, 'transferencia', '80.00',
         'income', '2199-01-01 15:00:00', $8, $5, 'Original'),
              ($6, $2, $7, 'recibo_cta_cte', $4, 'retencion_iibb', '20.00',
         'informational', '2199-01-01 15:00:00', false, NULL, 'Original')`,
      [
        ids.cashIds[0],
        ids.sourceShiftId,
        options.rowArea ?? "recepcion",
        ids.receiptId,
        options.cashPaymentId ?? null,
        ids.cashIds[1],
        options.secondRowArea ?? options.rowArea ?? "recepcion",
        options.cashAnnulled ?? false,
      ],
    );
    return { ...ids, paymentIds, groupPaymentIds, groupIds };
  } catch (error) {
    await testPool.query("DELETE FROM cash_movements WHERE id = ANY($1::varchar[])", [ids.cashIds]).catch(() => undefined);
    await testPool.query("DELETE FROM account_movements WHERE id = $1", [ids.receiptId]).catch(() => undefined);
    if (paymentIds.length) await testPool.query("DELETE FROM payments WHERE id = ANY($1::varchar[])", [paymentIds]).catch(() => undefined);
    if (groupPaymentIds.length) await testPool.query("DELETE FROM group_payments WHERE id = ANY($1::varchar[])", [groupPaymentIds]).catch(() => undefined);
    if (groupIds.length) await testPool.query("DELETE FROM groups WHERE id = ANY($1::varchar[])", [groupIds]).catch(() => undefined);
    await testPool.query("DELETE FROM cash_shifts WHERE id = ANY($1::varchar[])", [[ids.sourceShiftId, ids.targetShiftId]]).catch(() => undefined);
    throw error;
  }
}

runIfSafeDisposableDatabase("direct Cuenta Corriente receipt cash-shift repair route", () => {
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    if (!testPool) return;
    const receiptIds = fixtures.map((fixture) => fixture.receiptId);
    const shiftIds = fixtures.flatMap((fixture) => [fixture.sourceShiftId, fixture.targetShiftId]);
    const cashIds = fixtures.flatMap((fixture) => fixture.cashIds);
    const paymentIds = fixtures.flatMap((fixture) => fixture.paymentIds);
    const groupPaymentIds = fixtures.flatMap((fixture) => fixture.groupPaymentIds);
    const groupIds = fixtures.flatMap((fixture) => fixture.groupIds);
    if (receiptIds.length) {
      await testPool.query(
        "DELETE FROM audit_logs WHERE entity_type = 'account_movement' AND entity_id = ANY($1::varchar[])",
        [receiptIds],
      );
      await testPool.query("DELETE FROM cash_movements WHERE id = ANY($1::varchar[])", [cashIds]);
      await testPool.query("DELETE FROM account_movements WHERE id = ANY($1::varchar[])", [receiptIds]);
    }
    if (paymentIds.length) await testPool.query("DELETE FROM payments WHERE id = ANY($1::varchar[])", [paymentIds]);
    if (groupPaymentIds.length) await testPool.query("DELETE FROM group_payments WHERE id = ANY($1::varchar[])", [groupPaymentIds]);
    if (groupIds.length) await testPool.query("DELETE FROM groups WHERE id = ANY($1::varchar[])", [groupIds]);
    if (shiftIds.length) await testPool.query("DELETE FROM cash_shifts WHERE id = ANY($1::varchar[])", [shiftIds]);
    await testPool.end();
  });

  it("uses the real auth/role middleware for endpoint access", async () => {
    role = "reception";
    authenticated = true;
    const app = await startRoute();
    try {
      const forbidden = await request(app.baseUrl, `/api/account-movements/${randomUUID()}/cash-shift-repair-preview`);
      expect(forbidden.status).toBe(403);
      authenticated = false;
      const unauthorized = await request(app.baseUrl, `/api/account-movements/${randomUUID()}/cash-shift-repair-preview`);
      expect(unauthorized.status).toBe(401);
    } finally {
      role = "admin";
      authenticated = true;
      await app.close();
    }
  });

  it("previews and applies only the existing rows, preserves receipt/movement data, audits atomically, and is idempotent", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);
    role = "manager";
    authenticated = true;
    const app = await startRoute();
    try {
      const preview = await request(app.baseUrl, `/api/account-movements/${fixture.receiptId}/cash-shift-repair-preview`);
      expect(preview.status).toBe(200);
      expect(preview.body).toMatchObject({
        receiptId: fixture.receiptId,
        receiptNumber: fixture.receiptNumber,
        grossAmount: "100.00",
        cashAmount: "80.00",
        retentionAmount: "20.00",
        movementCount: 2,
        canRepair: true,
        status: "needs_repair",
        targetShift: { id: fixture.targetShiftId, area: "reception", status: "open" },
      });
      expect(typeof preview.body.previewToken).toBe("string");
      expect(preview.body.fromShifts).toEqual([
        expect.objectContaining({ id: fixture.sourceShiftId, status: "open" }),
      ]);

      const apply = await request(
        app.baseUrl,
        `/api/account-movements/${fixture.receiptId}/cash-shift-repair`,
        "POST",
        { previewToken: preview.body.previewToken, targetShiftId: fixture.targetShiftId },
      );
      expect(apply.status).toBe(200);
      expect(apply.body.status).toBe("already_correct");
      expect(apply.body.canRepair).toBe(false);
      const rows = await testPool!.query(
        `SELECT id, shift_id, area, amount, movement_type, payment_method, source_type, source_id,
                created_at, registered_by
         FROM cash_movements WHERE id = ANY($1::varchar[]) ORDER BY id`,
        [fixture.cashIds],
      );
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows.every((row) => row.shift_id === fixture.targetShiftId && row.area === "reception")).toBe(true);
      expect(rows.rows.map((row) => [row.id, row.amount, row.movement_type, row.payment_method, row.source_type, row.source_id, row.registered_by]))
        .toEqual(expect.arrayContaining([
          [fixture.cashIds[0], "80.00", "income", "transferencia", "recibo_cta_cte", fixture.receiptId, "Original"],
          [fixture.cashIds[1], "20.00", "informational", "retencion_iibb", "recibo_cta_cte", fixture.receiptId, "Original"],
        ]));
      const originalReceipt = await testPool!.query(
        "SELECT amount, receipt_number, retentions FROM account_movements WHERE id = $1",
        [fixture.receiptId],
      );
      expect(originalReceipt.rows[0]).toMatchObject({
        amount: "-100.00",
        receipt_number: fixture.receiptNumber,
      });
      const audit = await testPool!.query(
        `SELECT action, module, details FROM audit_logs
         WHERE entity_type = 'account_movement' AND entity_id = $1`,
        [fixture.receiptId],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({ action: "update", module: "cc-receipt-cash-repair" });
      expect(JSON.parse(audit.rows[0].details)).toMatchObject({
        movementIds: expect.arrayContaining(fixture.cashIds),
        targetShift: expect.objectContaining({ id: fixture.targetShiftId }),
      });

      const correctPreview = await request(app.baseUrl, `/api/account-movements/${fixture.receiptId}/cash-shift-repair-preview`);
      expect(correctPreview.body.status).toBe("already_correct");
      expect(correctPreview.body.canRepair).toBe(false);
      const repeated = await request(
        app.baseUrl,
        `/api/account-movements/${fixture.receiptId}/cash-shift-repair`,
        "POST",
        { previewToken: preview.body.previewToken, targetShiftId: fixture.targetShiftId },
      );
      expect(repeated.status).toBe(200);
      const repeatedSamePost = await request(
        app.baseUrl,
        `/api/account-movements/${fixture.receiptId}/cash-shift-repair`,
        "POST",
        { previewToken: preview.body.previewToken, targetShiftId: fixture.targetShiftId },
      );
      expect(repeatedSamePost.status).toBe(200);
      expect((await testPool!.query(
        `SELECT id FROM audit_logs WHERE entity_type = 'account_movement' AND entity_id = $1`,
        [fixture.receiptId],
      )).rows).toHaveLength(1);
      expect((await testPool!.query(
        "SELECT id FROM cash_movements WHERE source_type = 'recibo_cta_cte' AND source_id = $1",
        [fixture.receiptId],
      )).rows.map((row) => row.id).sort()).toEqual(fixture.cashIds.slice().sort());
    } finally {
      await app.close();
    }
  });

  it("rejects stale preview evidence without changing rows", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);
    const app = await startRoute();
    try {
      const preview = await request(app.baseUrl, `/api/account-movements/${fixture.receiptId}/cash-shift-repair-preview`);
      await testPool!.query("UPDATE cash_movements SET registered_by = 'Concurrent edit' WHERE id = $1", [fixture.cashIds[0]]);
      const stale = await request(
        app.baseUrl,
        `/api/account-movements/${fixture.receiptId}/cash-shift-repair`,
        "POST",
        { previewToken: preview.body.previewToken, targetShiftId: fixture.targetShiftId },
      );
      expect(stale.status).toBe(409);
      const rows = await testPool!.query("SELECT shift_id FROM cash_movements WHERE id = ANY($1::varchar[])", [fixture.cashIds]);
      expect(rows.rows.every((row) => row.shift_id === fixture.sourceShiftId)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("takes the receipt row lock before applying", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);
    const app = await startRoute();
    const blocker = await testPool!.connect();
    try {
      const preview = await request(app.baseUrl, `/api/account-movements/${fixture.receiptId}/cash-shift-repair-preview`);
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM account_movements WHERE id = $1 FOR UPDATE", [fixture.receiptId]);
      let completed = false;
      const pendingApply = request(
        app.baseUrl,
        `/api/account-movements/${fixture.receiptId}/cash-shift-repair`,
        "POST",
        { previewToken: preview.body.previewToken, targetShiftId: fixture.targetShiftId },
      ).then((result) => {
        completed = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(completed).toBe(false);
      await blocker.query("COMMIT");
      const applied = await pendingApply;
      expect(applied.status).toBe(200);
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
      await app.close();
    }
  });

  it("rejects an overlapping receipt-void update after waiting for the receipt lock", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);
    const app = await startRoute();
    const blocker = await testPool!.connect();
    try {
      const preview = await request(app.baseUrl, `/api/account-movements/${fixture.receiptId}/cash-shift-repair-preview`);
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM account_movements WHERE id = $1 FOR UPDATE", [fixture.receiptId]);
      const pendingApply = request(
        app.baseUrl,
        `/api/account-movements/${fixture.receiptId}/cash-shift-repair`,
        "POST",
        { previewToken: preview.body.previewToken, targetShiftId: fixture.targetShiftId },
      );
      await waitForRepairLockWait("SELECT * FROM account_movements WHERE id = $1 FOR UPDATE%");
      await blocker.query("UPDATE account_movements SET voided = true WHERE id = $1", [fixture.receiptId]);
      await blocker.query("COMMIT");
      const result = await pendingApply;
      expect(result.status).toBe(409);
      expect(result.body.error).toMatch(/conflicto concurrente|nueva vista previa/i);
      const rows = await testPool!.query("SELECT shift_id FROM cash_movements WHERE id = ANY($1::varchar[])", [fixture.cashIds]);
      expect(rows.rows.every((row) => row.shift_id === fixture.sourceShiftId)).toBe(true);
      expect((await testPool!.query(
        "SELECT id FROM audit_logs WHERE entity_type = 'account_movement' AND entity_id = $1 AND module = 'cc-receipt-cash-repair'",
        [fixture.receiptId],
      )).rows).toHaveLength(0);
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
      await app.close();
    }
  });

  it("rejects an overlapping shift-close update after waiting for the target-shift lock", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);
    const app = await startRoute();
    const blocker = await testPool!.connect();
    try {
      const preview = await request(app.baseUrl, `/api/account-movements/${fixture.receiptId}/cash-shift-repair-preview`);
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM cash_shifts WHERE id = $1 FOR UPDATE", [fixture.targetShiftId]);
      const pendingApply = request(
        app.baseUrl,
        `/api/account-movements/${fixture.receiptId}/cash-shift-repair`,
        "POST",
        { previewToken: preview.body.previewToken, targetShiftId: fixture.targetShiftId },
      );
      await waitForRepairLockWait("%FROM cash_shifts%FOR UPDATE%");
      await blocker.query(
        "UPDATE cash_shifts SET status = 'closed', closed_at = NOW(), closed_by = 'concurrent-test' WHERE id = $1",
        [fixture.targetShiftId],
      );
      await blocker.query("COMMIT");
      const result = await pendingApply;
      expect(result.status).toBe(409);
      expect(result.body.error).toMatch(/conflicto concurrente|nueva vista previa/i);
      const rows = await testPool!.query("SELECT shift_id FROM cash_movements WHERE id = ANY($1::varchar[])", [fixture.cashIds]);
      expect(rows.rows.every((row) => row.shift_id === fixture.sourceShiftId)).toBe(true);
      expect((await testPool!.query(
        "SELECT id FROM audit_logs WHERE entity_type = 'account_movement' AND entity_id = $1 AND module = 'cc-receipt-cash-repair'",
        [fixture.receiptId],
      )).rows).toHaveLength(0);
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
      await app.close();
    }
  });

  it("rolls back cash-row updates if transactional audit insertion fails", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);
    const suffix = randomUUID().replace(/-/g, "");
    const functionName = `cc_repair_audit_failure_${suffix}`;
    const triggerName = `cc_repair_audit_failure_${suffix}`;
    const app = await startRoute();
    try {
      await testPool!.query(
        `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN
           IF NEW.entity_id = '${fixture.receiptId}' AND NEW.module = 'cc-receipt-cash-repair' THEN
             RAISE EXCEPTION 'fixture audit failure';
           END IF;
           RETURN NEW;
         END
         $$`,
      );
      await testPool!.query(
        `CREATE TRIGGER ${triggerName} BEFORE INSERT ON audit_logs
         FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
      );
      const preview = await request(app.baseUrl, `/api/account-movements/${fixture.receiptId}/cash-shift-repair-preview`);
      const result = await request(
        app.baseUrl,
        `/api/account-movements/${fixture.receiptId}/cash-shift-repair`,
        "POST",
        { previewToken: preview.body.previewToken, targetShiftId: fixture.targetShiftId },
      );
      expect(result.status).toBe(500);
      const rows = await testPool!.query("SELECT shift_id FROM cash_movements WHERE id = ANY($1::varchar[])", [fixture.cashIds]);
      expect(rows.rows.every((row) => row.shift_id === fixture.sourceShiftId)).toBe(true);
      expect((await testPool!.query(
        "SELECT id FROM audit_logs WHERE entity_type = 'account_movement' AND entity_id = $1",
        [fixture.receiptId],
      )).rows).toHaveLength(0);
    } finally {
      await testPool!.query(`DROP TRIGGER IF EXISTS ${triggerName} ON audit_logs`).catch(() => undefined);
      await testPool!.query(`DROP FUNCTION IF EXISTS ${functionName}()`).catch(() => undefined);
      await app.close();
    }
  });

  it("rejects a destination that closes after the preview", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);
    const app = await startRoute();
    try {
      const preview = await request(app.baseUrl, `/api/account-movements/${fixture.receiptId}/cash-shift-repair-preview`);
      await testPool!.query("UPDATE cash_shifts SET status = 'closed', closed_at = NOW() WHERE id = $1", [fixture.targetShiftId]);
      const result = await request(
        app.baseUrl,
        `/api/account-movements/${fixture.receiptId}/cash-shift-repair`,
        "POST",
        { previewToken: preview.body.previewToken, targetShiftId: fixture.targetShiftId },
      );
      expect(result.status).toBe(409);
      expect(result.body.error).toMatch(/cambió|destino/i);
      const rows = await testPool!.query("SELECT shift_id FROM cash_movements WHERE id = ANY($1::varchar[])", [fixture.cashIds]);
      expect(rows.rows.every((row) => row.shift_id === fixture.sourceShiftId)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("blocks incomplete cash evidence that does not reconcile to exact receipt cents", async () => {
    const fixture = await createFixture();
    fixtures.push(fixture);
    await testPool!.query("UPDATE cash_movements SET amount = '79.00' WHERE id = $1", [fixture.cashIds[0]]);
    const app = await startRoute();
    try {
      const result = await request(app.baseUrl, `/api/account-movements/${fixture.receiptId}/cash-shift-repair-preview`);
      expect(result.body.status).toBe("blocked");
      expect(result.body.message).toMatch(/no suman exactamente/i);
    } finally {
      await app.close();
    }
  });

  it.each([
    ["voided receipt", { receiptVoided: true }, /anulado/i],
    ["annulled cash evidence", { cashAnnulled: true }, /filas anuladas/i],
    ["closed source", { sourceStatus: "closed" }, /origen.*cerrado/i],
    ["receipt predates destination", { receiptCreatedAt: "2199-01-01 12:00:00", targetOpenedAt: "2199-01-01 14:00:00" }, /antes de la apertura/i],
    ["reservation-linked flow", { reservationId: "linked-reservation" }, /vínculos.*reserva/i],
    ["payment-linked flow", { linkedMovement: "payment" }, /vínculos.*reserva/i],
    ["group-payment-linked flow", { linkedMovement: "group" }, /vínculos.*reserva/i],
    ["cash row has foreign payment link", { cashPaymentId: randomUUID() }, /vinculados a pagos externos/i],
    ["split logical areas", { secondRowArea: "spa" }, /áreas.*diferentes/i],
  ])("blocks unsafe evidence: %s", async (_name, options, expectedMessage) => {
    const fixture = await createFixture(options);
    fixtures.push(fixture);
    const app = await startRoute();
    try {
      const result = await request(app.baseUrl, `/api/account-movements/${fixture.receiptId}/cash-shift-repair-preview`);
      expect(result.status).toBe(200);
      expect(result.body.status).toBe("blocked");
      expect(result.body.canRepair).toBe(false);
      expect(result.body.previewToken).toBeNull();
      expect(result.body.message).toMatch(expectedMessage);
    } finally {
      await app.close();
    }
  });
});