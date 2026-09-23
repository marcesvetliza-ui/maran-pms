import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const testPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10_000 })
  : null;

runIfDatabaseIsConfigured("account movement receipt-number backfill", () => {
  const fixtureIds: string[] = [];

  afterAll(async () => {
    if (!testPool) return;
    await testPool.query("DELETE FROM account_movements WHERE id = ANY($1::varchar[])", [fixtureIds]);
    await testPool.end();
  });

  it("counts linked payments in legacy ordinals but numbers only direct receipts", async () => {
    if (!testPool) throw new Error("DATABASE_URL no está configurado");
    const { backfillAccountMovementReceiptNumbers } = await import("../migrate");
    const entityId = `receipt-backfill-${randomUUID()}`;
    const linkedBefore = randomUUID();
    const directSecond = randomUUID();
    const linkedBetween = randomUUID();
    const directFourth = randomUUID();
    fixtureIds.push(linkedBefore, directSecond, linkedBetween, directFourth);

    await testPool.query(
      `INSERT INTO account_movements
       (id, entity_type, entity_id, date, type, description, amount, reservation_id, created_at)
       VALUES
       ($1, 'company', $5, '2096-01-01', 'pago', 'Vinculado anterior', '-10.00', 'reservation-before', '2096-01-01 10:00:00'),
       ($2, 'company', $5, '2096-01-01', 'pago', 'Directo segundo', '-10.00', NULL, '2096-01-01 11:00:00'),
       ($3, 'company', $5, '2096-01-01', 'pago', 'Vinculado intermedio', '-10.00', 'reservation-between', '2096-01-01 12:00:00'),
       ($4, 'company', $5, '2096-01-01', 'pago', 'Directo cuarto', '-10.00', NULL, '2096-01-01 13:00:00')`,
      [linkedBefore, directSecond, linkedBetween, directFourth, entityId],
    );

    await backfillAccountMovementReceiptNumbers();

    const rows = await testPool.query(
      `SELECT id, receipt_number
       FROM account_movements
       WHERE id = ANY($1::varchar[])`,
      [[linkedBefore, directSecond, linkedBetween, directFourth]],
    );
    const byId = new Map(rows.rows.map((row) => [row.id, row.receipt_number]));
    expect(byId.get(linkedBefore)).toBeNull();
    expect(byId.get(directSecond)).toBe("REC-2096-0002");
    expect(byId.get(linkedBetween)).toBeNull();
    expect(byId.get(directFourth)).toBe("REC-2096-0004");
  });

  it("preserves preassigned receipt numbers and allocates new values after them", async () => {
    if (!testPool) throw new Error("DATABASE_URL no está configurado");
    const { backfillAccountMovementReceiptNumbers } = await import("../migrate");
    const entityId = `receipt-backfill-existing-${randomUUID()}`;
    const existingId = randomUUID();
    const missingId = randomUUID();
    const linkedId = randomUUID();
    fixtureIds.push(existingId, missingId, linkedId);

    await testPool.query(
      `INSERT INTO account_movements
       (id, entity_type, entity_id, date, type, description, amount, reservation_id, receipt_number, created_at)
       VALUES
       ($1, 'company', $4, '2097-01-01', 'pago', 'Directo numerado', '-10.00', NULL, 'REC-2097-0099', '2097-01-01 10:00:00'),
       ($2, 'company', $4, '2097-01-01', 'pago', 'Directo faltante', '-10.00', NULL, NULL, '2097-01-01 11:00:00'),
       ($3, 'company', $4, '2097-01-01', 'pago', 'Vinculado', '-10.00', 'reservation-linked', NULL, '2097-01-01 12:00:00')`,
      [existingId, missingId, linkedId, entityId],
    );

    await backfillAccountMovementReceiptNumbers();

    const rows = await testPool.query(
      `SELECT id, receipt_number
       FROM account_movements
       WHERE id = ANY($1::varchar[])`,
      [[existingId, missingId, linkedId]],
    );
    const byId = new Map(rows.rows.map((row) => [row.id, row.receipt_number]));
    expect(byId.get(existingId)).toBe("REC-2097-0099");
    expect(byId.get(missingId)).toBe("REC-2097-0100");
    expect(byId.get(linkedId)).toBeNull();
  });
});